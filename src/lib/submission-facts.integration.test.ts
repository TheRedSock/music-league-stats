import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import { actualVoterSongFactsCtes, getSubmissionFactsData, getSongsData, getPlayersData, midpointPercentileSql, qualificationRoundFloor, type ActualVoterSongFact } from "@/lib/analytics";

const { executeQuery } = vi.hoisted(() => ({ executeQuery: vi.fn() }));
vi.mock("@/db", () => ({ db: { execute: executeQuery } }));

const url = process.env.ANALYTICS_TEST_DATABASE_URL;

describe.skipIf(!url)("submission facts (read-only PostgreSQL fixtures)", () => {
  it("keeps directory metrics consistent with Facts across scopes and searches", async () => {
    const client = postgres(url!, { max: 1, prepare: false, connect_timeout: 10 });
    try {
      await client.begin("read only", async connection => {
        executeQuery.mockImplementation((statement: SQL) => {
          const query = new PgDialect().sqlToQuery(statement);
          return connection.unsafe(query.sql, query.params as postgres.ParameterOrJSON<never>[]);
        });
        const leagues = await connection<{ id: string }[]>`select id from leagues order by id limit 2`;
        const rounds = await connection<{ id: string }[]>`select id from rounds order by id limit 2`;
        for (const filter of [
          { leagueIds: [], roundIds: [] },
          { leagueIds: leagues.slice(0, 1).map(row => row.id), roundIds: [] },
          { leagueIds: leagues.map(row => row.id), roundIds: [] },
          { leagueIds: [], roundIds: rounds.map(row => row.id) },
        ]) {
          const facts = await getSubmissionFactsData(filter);
          const songs = await getSongsData(filter, { page: 1, pageSize: 100000, search: "", sort: "appeal-spread", direction: "desc" });
          const songById = new Map(songs.rows.map(row => [row.id, row]));
          for (const row of songs.rows) {
            expect(row.pointsPerActualVoter).toBeCloseTo(row.positiveRows ? row.points / row.positiveRows : 0);
            if (row.eligibleRows < 5) expect(row.appealSpread).toBeNull();
          }
          for (const fact of [...facts.thinSpreadSongs, ...facts.cultClassicSongs]) {
            expect(songById.get(fact.songId)?.appealSpread).toBeCloseTo(fact.appealSpread);
          }
          const available = songs.rows.filter(row => row.appealSpread != null);
          for (let i = 1; i < available.length; i++) expect(available[i - 1].appealSpread!).toBeGreaterThanOrEqual(available[i].appealSpread!);
          const song = available[0];
          if (song) {
            const searched = await getSongsData(filter, { page: 1, pageSize: 100000, search: song.title, sort: "points-per-actual-voter", direction: "desc" });
            expect(searched.rows.find(row => row.id === song.id)?.appealSpread).toBeCloseTo(song.appealSpread!);
            for (let i = 1; i < searched.rows.length; i++) {
              const a = searched.rows[i - 1], b = searched.rows[i];
              expect(a.pointsPerActualVoter!).toBeGreaterThanOrEqual(b.pointsPerActualVoter!);
              if (a.pointsPerActualVoter === b.pointsPerActualVoter) expect(a.points).toBeLessThanOrEqual(b.points);
            }
          }
          const players = await getPlayersData(filter, { search: "", sort: "points", direction: "desc" });
          for (let i = 1; i < players.rows.length; i++) expect(players.rows[i - 1].totalPoints).toBeGreaterThanOrEqual(players.rows[i].totalPoints);
          const playerById = new Map(players.rows.map(row => [row.id, row]));
          for (const fact of [...facts.crowdPleaserPlayers, ...facts.nicheDevotionPlayers]) {
            expect(playerById.get(fact.playerId)?.appealSpread).toBeCloseTo(fact.appealSpread);
          }
          const player = players.rows.find(row => row.appealSpread != null);
          if (player) {
            const searched = await getPlayersData(filter, { search: player.name, sort: "appeal-spread", direction: "asc" });
            expect(searched.rows.find(row => row.id === player.id)?.appealSpread).toBeCloseTo(player.appealSpread!);
          }
          const sorted = await getPlayersData(filter, { search: "", sort: "appeal-spread", direction: "asc" });
          const defined = sorted.rows.filter(row => row.appealSpread != null);
          for (let i = 1; i < defined.length; i++) expect(defined[i - 1].appealSpread!).toBeLessThanOrEqual(defined[i].appealSpread!);
        }
      });
    } finally {
      executeQuery.mockReset();
      await client.end({ timeout: 3 });
    }
  }, 120000);

  it("loads the complete facts query and returns empty rankings for an empty scope", async () => {
    const client = postgres(url!, { max: 1, prepare: false, connect_timeout: 10 });
    try {
      await client.begin("read only", async (connection) => {
        executeQuery.mockImplementation((statement: SQL) => {
          const query = new PgDialect().sqlToQuery(statement);
          return connection.unsafe(query.sql, query.params as postgres.ParameterOrJSON<never>[]);
        });
        const data = await getSubmissionFactsData({ leagueIds: [], roundIds: [] });
        for (const rows of [data.highestAverageVoteSongs, data.lowestAverageVoteSongs]) {
          expect(Array.isArray(rows)).toBe(true);
          for (const row of rows) {
            expect(typeof row.averageVotes).toBe("number");
            expect(row.averageVotes).toBeCloseTo(row.actualVoters ? row.points / row.actualVoters : 0);
          }
        }
        for (const [rows, direction] of [
          [data.highestAverageVoteSongs, 1], [data.lowestAverageVoteSongs, -1],
        ] as const) {
          for (let i = 1; i < rows.length; i++) {
            if (rows[i].averageVotes === rows[i - 1].averageVotes) {
              expect(direction * (rows[i].points - rows[i - 1].points)).toBeGreaterThanOrEqual(0);
            }
          }
        }
        for (const rows of [data.thinSpreadSongs, data.cultClassicSongs, data.longestTitles, data.shortestTitles]) {
          for (const row of rows) expect(typeof row.spotifyUri).toBe("string");
        }
        // Independently calculate the reference distributions, including player
        // qualification, to check both populations rather than just SQL shape.
        const songs = await connection.unsafe<{ id: string; submitter_id: string; round_id: string; reach: number; share: number }[]>(`
          select id, submitter_id, round_id, positive_reach as reach, round_point_share as share
          from analytics_song_stats
          where positive_reach is not null and round_point_share is not null and eligible_rows >= 5
        `);
        const [{ n }] = await connection`select count(*)::int as n from rounds`;
        const groups = new Map<string, typeof songs[number][]>();
        for (const song of songs) groups.set(song.submitter_id, [...(groups.get(song.submitter_id) ?? []), song]);
        const players = [...groups.entries()]
          .filter(([, rows]) => rows.length >= 3 && new Set(rows.map(row => row.round_id)).size >= qualificationRoundFloor(n, n))
          .map(([id, rows]) => ({
            id,
            reach: rows.reduce((sum, row) => sum + row.reach, 0) / rows.length,
            share: rows.reduce((sum, row) => sum + row.share, 0) / rows.length,
          }));
        const midpoint = (values: number[], value: number) =>
          100 * (values.filter(candidate => candidate < value).length
            + values.filter(candidate => candidate === value).length / 2) / values.length;
        for (const [rankedRows, population, direction] of [
          [data.thinSpreadSongs, songs, 1], [data.cultClassicSongs, songs, -1],
          [data.crowdPleaserPlayers, players, 1], [data.nicheDevotionPlayers, players, -1],
        ] as const) {
          const reaches = population.map(row => row.reach);
          const shares = population.map(row => row.share);
          for (const [index, row] of rankedRows.entries()) {
            const original = population.find(candidate => candidate.id === ("songId" in row ? row.songId : row.playerId))!;
            expect(row.reachPercentile).toBeCloseTo(midpoint(reaches, original.reach));
            expect(row.sharePercentile).toBeCloseTo(midpoint(shares, original.share));
            expect(row.appealSpread).toBeCloseTo(row.reachPercentile - row.sharePercentile);
            expect(direction * row.appealSpread).toBeGreaterThan(0);
            if (index) expect(direction * (rankedRows[index - 1].appealSpread - row.appealSpread)).toBeGreaterThanOrEqual(0);
          }
        }
        const empty = await getSubmissionFactsData({
          leagueIds: ["00000000-0000-4000-8000-000000000000"], roundIds: [],
        });
        expect(empty.highestAverageVoteSongs).toEqual([]);
        expect(empty.lowestAverageVoteSongs).toEqual([]);
        expect(empty.thinSpreadSongs).toEqual([]);
        expect(empty.cultClassicSongs).toEqual([]);
        expect(empty.crowdPleaserPlayers).toEqual([]);
        expect(empty.nicheDevotionPlayers).toEqual([]);
      });
    } finally {
      executeQuery.mockReset();
      await client.end({ timeout: 3 });
    }
  });

  it.each([
    {
      name: "ties share their midpoint",
      values: [[0.1, 0.2], [0.8, 0.2], [0.8, 0.5], [1, 0.9]],
      expected: [[12.5, 25], [50, 25], [50, 62.5], [87.5, 87.5]],
    },
    {
      name: "extreme magnitudes do not inflate rank gaps",
      values: [[0.1, 0.2], [0.8, 0.2], [0.8, 0.5], [100, 10000]],
      expected: [[12.5, 25], [50, 25], [50, 62.5], [87.5, 87.5]],
    },
    {
      name: "flat reach still allows share to distinguish rows",
      values: [[0.5, 1], [0.5, 2]],
      expected: [[50, 25], [50, 75]],
    },
    {
      name: "all tied metrics have zero spread",
      values: [[0.5, 0.1], [0.5, 0.1]],
      expected: [[50, 50], [50, 50]],
    },
    {
      name: "a singleton has zero spread",
      values: [[0.5, 0.1]],
      expected: [[50, 50]],
    },
  ])("calculates appeal percentiles: $name", async ({ values, expected }) => {
    const client = postgres(url!, { max: 1, prepare: false, connect_timeout: 10 });
    try {
      await client.begin("read only", async connection => {
        const query = new PgDialect().sqlToQuery(sql`
          with fixture(id, reach, share) as (
            values ${sql.join(values.map(([reach, share], index) => sql`(${index}::int, ${reach}::double precision, ${share}::double precision)`), sql`, `)}
          )
          select id,
            ${midpointPercentileSql(sql`reach`)} as reach,
            ${midpointPercentileSql(sql`share`)} as share
          from fixture order by id
        `);
        const rows = await connection.unsafe(query.sql, query.params as postgres.ParameterOrJSON<never>[]);
        expect(rows.map(row => [row.reach, row.share])).toEqual(expected);
      });
    } finally { await client.end({ timeout: 3 }); }
  });

  it("ranks averages independently of audience size, preserves ties, and puts unvoted songs last", async () => {
    const client = postgres(url!, { max: 1, prepare: false, connect_timeout: 10 });
    try {
      await client.begin("read only", async (connection) => {
        const query = new PgDialect().sqlToQuery(sql`
          with scoped_songs as (
            select
              title as id, title as song_title, points, positive_rows,
              100 as eligible_rows,
              'spotify:track:fixture' as spotify_uri,
              'Artist' as artist_name, 'player' as submitter_id,
              'Player' as submitter_name, 'League' as league_name,
              'league' as league_slug, null::text as league_music_league_id,
              'round' as source_round_id, 'Round' as round_name, 1 as round_ordinal
            from (values
              ('Solo five', 5, 1), ('Broad two', 20, 10),
              ('Ten ones', 10, 10), ('Solo one', 1, 1),
              ('No voters', 0, 0), ('Only zeroes', 0, 0),
              ('Fractional', 10, 3)
            ) as fixture(title, points, positive_rows)
          ),
          ${actualVoterSongFactsCtes()}
          select
            (select json_agg(to_jsonb(s) order by "averageVotes" desc, points asc, title, "songId")
              from highest_average_vote_songs s) as highest,
            (select json_agg(to_jsonb(s) order by "averageVotes" asc, points desc, title, "songId")
              from lowest_average_vote_songs s) as lowest
        `);
        const [result] = await connection.unsafe(query.sql, query.params as postgres.ParameterOrJSON<never>[]);
        const highest = result.highest as ActualVoterSongFact[];
        const lowest = result.lowest as ActualVoterSongFact[];

        expect(highest.map(({ title, rank }) => [title, rank])).toEqual([
          ["Solo five", 1], ["Fractional", 2], ["Broad two", 3],
          ["Solo one", 4], ["Ten ones", 4], ["No voters", 5], ["Only zeroes", 5],
        ]);
        expect(lowest.map(({ title, rank }) => [title, rank])).toEqual([
          ["No voters", 1], ["Only zeroes", 1], ["Ten ones", 2],
          ["Solo one", 2], ["Broad two", 3], ["Fractional", 4], ["Solo five", 5],
        ]);
        expect(highest[0]).toMatchObject({ averageVotes: 5, actualVoters: 1, points: 5 });
        expect(highest[1].averageVotes).toBeCloseTo(10 / 3);
        expect(lowest[0]).toMatchObject({ averageVotes: 0, actualVoters: 0, points: 0 });
      });
    } finally {
      await client.end({ timeout: 3 });
    }
  });
});
