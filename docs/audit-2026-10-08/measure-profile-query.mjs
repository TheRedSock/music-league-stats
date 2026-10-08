// Isolates the four correlated calculations used by the profile's highest-votes list.
// Both candidates are SELECT-only and run in a PostgreSQL READ ONLY transaction.
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
    const grouped = `with ballot_counts as (
      select round_id,points,sum(count(*)) over(partition by round_id order by points desc)::int as songs_at_least
      from analytics_effective_votes where voter_id=$1 group by round_id,points
    ), song_counts as (
      select submission_id,points,
        sum(count(*)) over(partition by submission_id order by points desc)::int as voters_at_least,
        sum(sum(points)) over(partition by submission_id)::float8 as song_points,
        sum(count(*)) over(partition by submission_id)::int as song_eligible_voters
      from analytics_effective_votes group by submission_id,points
    ) select ev.submission_id,ev.round_id,ev.points,b.songs_at_least,s.song_points,s.song_eligible_voters,s.voters_at_least
      from analytics_effective_votes ev
      join ballot_counts b on b.round_id=ev.round_id and b.points=ev.points
      join song_counts s on s.submission_id=ev.submission_id and s.points=ev.points
      where ev.voter_id=$1 and ev.points>0 order by ev.submission_id`;
    const results = [];
    let baseline;
    for (const [label,query] of [['original',original],['grouped',grouped]]) {
      const samples=[];
      for(let i=0;i<3;i++) {
        const start=performance.now(); const rows=await tx.unsafe(query,[id]);
        const ms=Math.round(performance.now()-start);
        const serialized=JSON.stringify([...rows]);
        if(!baseline) baseline=serialized;
        if(serialized!==baseline) throw new Error('Output mismatch');
        samples.push({ms,rows:rows.length});
      }
      const plan = await tx.unsafe('explain (analyze,buffers,format json) '+query,[id]);
      const result={label,samples,plan:plan[0]['QUERY PLAN']};
      results.push(result); console.log(JSON.stringify({label,samples,executionMs:result.plan[0]['Execution Time']}));
    }
    await writeFile('docs/audit-2026-10-08/profile-query-comparison.json',JSON.stringify({measuredAt:new Date().toISOString(),readOnly:true,exactRowsEqual:true,note:'Isolated calculation benchmark; not a full profile refactor or page speed claim. Warm database, three samples each; grouped query tested only against this player and all-leagues data.',results},null,2));
  });
} finally { await db.end(); }
