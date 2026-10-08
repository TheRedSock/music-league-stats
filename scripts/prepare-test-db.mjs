// Creates schema and deterministic fixtures only in an EMPTY local *_test database.
import postgres from "postgres";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const url = new URL(process.env.ANALYTICS_TEST_DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_test")) throw new Error("Use a local disposable database whose name ends in _test.");
const db = postgres(url.toString(), { max: 1, onnotice: () => {} });
const id = value => { const hex = createHash("md5").update(value).digest("hex"); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`; };
try {
  if ((await db`select tablename from pg_tables where schemaname='public'`).length) throw new Error("Database must be empty; this command never deletes existing data.");
  for (const file of (await readdir("drizzle")).filter(f => f.endsWith(".sql")).sort()) await db.unsafe(await readFile(`drizzle/${file}`, "utf8"));
  for (let p=0;p<6;p++) await db`insert into competitors (id,source_competitor_id,name,slug) values (${id(`p${p}`)},${`p${p}`},${`Player ${p}`},${`player-${p}`})`;
  for (let l=0;l<2;l++) {
    const league = id(`l${l}`);
    await db`insert into leagues (id,source_league_id,slug,name,total_rounds,max_players,songs_per_player_per_round) values (${league},${`l${l}`},${`league-${l}`},${`League ${l}`},8,6,1)`;
    for (let p=0;p<6;p++) await db`insert into league_members (league_id,competitor_id) values (${league},${id(`p${p}`)})`;
    for (let r=0;r<8;r++) {
      const round = id(`l${l}r${r}`), date = `2026-01-${String(r+1).padStart(2,"0")}T12:00:00Z`;
      await db`insert into rounds (id,league_id,source_round_id,ordinal,name,source_created_at) values (${round},${league},${`r${r}`},${r+1},${`Round ${r+1}`},${date})`;
      for (let p=0;p<6;p++) await db`insert into submissions (id,league_id,round_id,source_submission_id,submitter_id,spotify_uri,song_title,artist_name,submitted_at,playlist_index,visible_to_voters) values (${id(`${round}p${p}`)},${league},${round},${`s${p}`},${id(`p${p}`)},${`spotify:track:${String(p).padStart(22,"0")}`},${`Song ${p}`},${`Artist ${p}`},${date},${p},true)`;
      for (let voter=0;voter<6;voter++) for (let song=0;song<6;song++) if (voter!==song) {
        const points = voter%2 ? 5-song : song;
        // Omit some zeroes to exercise inferred eligible votes as well.
        if (points || r%2) await db`insert into votes (league_id,round_id,submission_id,voter_id,points,cast_at) values (${league},${round},${id(`${round}p${song}`)},${id(`p${voter}`)},${points},${date})`;
      }
    }
  }
  console.log("Prepared isolated schema: 2 leagues, 16 rounds, 6 players, 96 submissions.");
} finally { await db.end(); }
