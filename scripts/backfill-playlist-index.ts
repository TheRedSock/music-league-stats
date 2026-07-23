/**
 * Backfill submissions.playlist_index from Music League submissions.csv exports
 * without running a full CSV import / analytics refresh.
 *
 * Expects a data root with league folders l1..l8 (oldest → newest by start date),
 * each containing submissions.csv. League mapping is start_date order in Postgres.
 *
 * Usage:
 *   npx tsx scripts/backfill-playlist-index.ts --data "C:/path/to/musicleague/data"
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "dotenv";
import Papa from "papaparse";
import postgres from "postgres";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const FOLDERS = ["l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8"] as const;

type CsvRow = {
  "Spotify URI"?: string;
  "Round ID"?: string;
};

function argValue(name: string): string | undefined {
  const exact = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (exact) return exact.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function playlistIndexesFromCsv(path: string): Array<{
  sourceRoundId: string;
  spotifyUri: string;
  playlistIndex: number;
}> {
  const text = readFileSync(path, "utf8");
  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length) {
    throw new Error(`${path}: ${parsed.errors[0]?.message}`);
  }

  const counters = new Map<string, number>();
  const seen = new Set<string>();
  const out: Array<{
    sourceRoundId: string;
    spotifyUri: string;
    playlistIndex: number;
  }> = [];

  for (const row of parsed.data) {
    const spotifyUri = row["Spotify URI"]?.trim();
    const sourceRoundId = row["Round ID"]?.trim();
    if (!spotifyUri || !sourceRoundId) continue;
    const key = `${sourceRoundId}\0${spotifyUri}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const next = counters.get(sourceRoundId) ?? 0;
    counters.set(sourceRoundId, next + 1);
    out.push({ sourceRoundId, spotifyUri, playlistIndex: next });
  }
  return out;
}

async function main() {
  const dataRoot = argValue("--data") ?? argValue("-d");
  if (!dataRoot) {
    throw new Error(
      'Pass the exports root: --data "…/musicleague/data" (folders l1..l8).',
    );
  }

  const databaseUrl =
    process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or DATABASE_URL_DIRECT is required.");
  }

  const sql = postgres(databaseUrl, { prepare: false, max: 1 });

  try {
    const leagues = await sql<{ id: string; slug: string }[]>`
      select id, slug from leagues
      order by start_date nulls last, name
    `;
    if (leagues.length !== FOLDERS.length) {
      throw new Error(
        `Expected ${FOLDERS.length} leagues ordered by start_date, got ${leagues.length}`,
      );
    }

    console.log("Mapping:");
    for (let i = 0; i < FOLDERS.length; i++) {
      console.log(`  ${FOLDERS[i]} -> ${leagues[i]!.slug}`);
    }

    let totalUpdated = 0;
    let totalRows = 0;
    let totalMissing = 0;

    for (let i = 0; i < FOLDERS.length; i++) {
      const folder = FOLDERS[i]!;
      const league = leagues[i]!;
      const csvPath = join(dataRoot, folder, "submissions.csv");
      const indexes = playlistIndexesFromCsv(csvPath);
      totalRows += indexes.length;

      const sourceRoundIds = indexes.map((row) => row.sourceRoundId);
      const spotifyUris = indexes.map((row) => row.spotifyUri);
      const playlistIndexes = indexes.map((row) => row.playlistIndex);

      const result = await sql<{
        updated: number;
        missing: number;
      }[]>`
        with incoming as (
          select *
          from unnest(
            ${sourceRoundIds}::text[],
            ${spotifyUris}::text[],
            ${playlistIndexes}::int[]
          ) as t(source_round_id, spotify_uri, playlist_index)
        ),
        updated as (
          update submissions s
          set
            playlist_index = i.playlist_index,
            updated_at = now()
          from incoming i
          join rounds r
            on r.source_round_id = i.source_round_id
           and r.league_id = ${league.id}
          where s.round_id = r.id
            and s.spotify_uri = i.spotify_uri
            and s.league_id = ${league.id}
          returning s.id
        )
        select
          (select count(*)::int from updated) as updated,
          (
            select count(*)::int
            from incoming i
            left join rounds r
              on r.source_round_id = i.source_round_id
             and r.league_id = ${league.id}
            left join submissions s
              on s.round_id = r.id
             and s.spotify_uri = i.spotify_uri
             and s.league_id = ${league.id}
            where s.id is null
          ) as missing
      `;

      const row = result[0]!;
      totalUpdated += row.updated;
      totalMissing += row.missing;
      console.log(
        `${folder} (${league.slug}): csv=${indexes.length} updated=${row.updated} missing=${row.missing}`,
      );
    }

    const coverage = await sql`
      select
        count(*)::int as total,
        count(playlist_index)::int as with_idx,
        count(*) filter (where playlist_index is null)::int as null_idx
      from submissions
    `;

    console.log(
      `Done. csvRows=${totalRows} updated=${totalUpdated} missing=${totalMissing}`,
    );
    console.log("Coverage", coverage[0]);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
