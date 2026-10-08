// Isolates the four correlated calculations used by the profile's highest-votes list.
// Both candidates are SELECT-only and run in a PostgreSQL READ ONLY transaction.
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profileVoteCountCtes, profileVoteCountJoins } from '../src/lib/profile-vote-sql';
import { config } from 'dotenv';
import postgres from 'postgres';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
config({path:'.env',quiet:true}); config({path:'.env.local',override:true,quiet:true});
const db = postgres(process.env.DATABASE_URL,{max:1,prepare:false});
try {
  await db.begin('read only',async tx=>{
    await tx`set local statement_timeout = '15s'`;
    const [{id}] = await tx`select id from competitors where slug = 'theredsock'`;
    const original = `select ev.submission_id, ev.round_id, ev.points,
      (select count(*)::int from analytics_effective_votes peer where peer.round_id=ev.round_id and peer.voter_id=ev.voter_id and peer.points>=ev.points) as songs_at_least,
      (select coalesce(sum(peer.points),0)::float8 from analytics_effective_votes peer where peer.submission_id=ev.submission_id) as song_points,
      (select count(*)::int from analytics_effective_votes peer where peer.submission_id=ev.submission_id) as song_eligible_voters,
      (select count(*)::int from analytics_effective_votes peer where peer.submission_id=ev.submission_id and peer.points>=ev.points) as voters_at_least
      from analytics_effective_votes ev where ev.voter_id=$1 and ev.points>0 order by ev.submission_id`;
    const compiled = new PgDialect().sqlToQuery(sql`with ${profileVoteCountCtes("analytics_effective_votes", id)}
      select ev.submission_id, ev.round_id, ev.points,
      bc.songs_at_least, sc.song_points, sc.song_eligible_voters, sc.voters_at_least
      from analytics_effective_votes ev ${profileVoteCountJoins}
      where ev.voter_id=${id} and ev.points>0 order by ev.submission_id`);
    const grouped = compiled.sql;
    const results = [];
    let baseline;
    for (const [label,query] of [['original',original],['grouped',grouped]]) {
      const samples=[];
      for(let i=0;i<3;i++) {
        const start=performance.now(); const rows=await tx.unsafe(query,label==='original'?[id]:compiled.params);
        const ms=Math.round(performance.now()-start);
        const serialized=JSON.stringify([...rows]);
        if(!baseline) baseline=serialized;
        if(serialized!==baseline) throw new Error('Output mismatch');
        samples.push({ms,rows:rows.length});
      }
      const plan = await tx.unsafe('explain (analyze,buffers,format json) '+query,label==='original'?[id]:compiled.params);
      const result={label,samples,plan:plan[0]['QUERY PLAN']};
      results.push(result); console.log(JSON.stringify({label,samples,executionMs:result.plan[0]['Execution Time']}));
    }
    await writeFile('docs/delivery-evidence/stage-5-profile-query.json',JSON.stringify({measuredAt:new Date().toISOString(),readOnly:true,exactRowsEqual:true,note:'Isolated calculation benchmark; uses the application SQL builder; not a page speed claim. Warm database, three samples each; grouped query tested only against this player and all-leagues data.',results},null,2));
  });
} finally { await db.end(); }
