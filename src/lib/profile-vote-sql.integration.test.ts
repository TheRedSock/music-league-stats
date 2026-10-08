import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { profileVoteCountCtes, profileVoteCountColumns, profileVoteCountJoins } from "@/lib/profile-vote-sql";

const url = process.env.ANALYTICS_TEST_DATABASE_URL;
describe.skipIf(!url)("profile grouped counts", () => {
  it("exactly matches correlated counts for tied points, inferred zeroes and multiple rounds", async () => {
    const client = postgres(url!, { max: 1 });
    try {
      for (const source of ["analytics_effective_votes", "effective_votes"] as const) {
        for (const leagueIds of [[], ["l1"], ["l2"], ["missing"]]) {
        const relation = sql.identifier(source);
        const query = new PgDialect().sqlToQuery(sql`
          with ${relation}(league_id,round_id,submission_id,voter_id,points) as (values
            ('l1','r1','s1','a',3),('l1','r1','s2','a',3),('l1','r1','s3','a',0),
            ('l1','r1','s1','b',3),('l1','r1','s2','b',0),('l1','r1','s3','b',2),
            ('l1','r1','s1','c',0),('l1','r1','s2','c',5),('l1','r1','s3','c',0),
            ('l2','r2','s4','a',1),('l2','r2','s5','a',0),('l2','r2','s4','b',0),('l2','r2','s5','b',1)
          ), ${profileVoteCountCtes(source, "a", leagueIds)}
          select ev.submission_id, ${profileVoteCountColumns},
            (select count(*)::int from ${relation} p where p.round_id=ev.round_id and p.voter_id=ev.voter_id and p.points>=ev.points) as expected_ballot,
            (select sum(points)::float8 from ${relation} p where p.submission_id=ev.submission_id) as expected_points,
            (select count(*)::int from ${relation} p where p.submission_id=ev.submission_id) as expected_voters,
            (select count(*)::int from ${relation} p where p.submission_id=ev.submission_id and p.points>=ev.points) as expected_at_least
          from ${relation} ev ${profileVoteCountJoins} where ev.voter_id='a' and ev.points>0 and ${leagueIds.length ? sql`ev.league_id in (${sql.join(leagueIds.map(id=>sql`${id}`),sql`, `)})` : sql`true`}
        `);
        const rows = await client.unsafe(query.sql, query.params as postgres.ParameterOrJSON<never>[]);
        expect(rows).toHaveLength(!leagueIds.length ? 3 : leagueIds[0] === "l1" ? 2 : leagueIds[0] === "l2" ? 1 : 0);
        for (const row of rows) expect([row.songsAtLeast,row.songPoints,row.songEligibleVoters,row.votersAtLeast]).toEqual([row.expected_ballot,row.expected_points,row.expected_voters,row.expected_at_least]);
      }
      }
    } finally { await client.end(); }
  });
});
