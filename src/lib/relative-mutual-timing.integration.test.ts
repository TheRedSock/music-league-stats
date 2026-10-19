import { describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { mutualSupportCtes } from "./mutual-support-sql";
import { timingRoundCtes } from "./voting-timing-sql";
import { voteOpportunityCtes } from "./analytics";

vi.mock("next/server",()=>({after:vi.fn()}));
const url=process.env.ANALYTICS_TEST_DATABASE_URL;
const dialect=new PgDialect();
type Opportunity={round:string;voter:string;recipient:string;points:number};
async function query(db:ReturnType<typeof postgres>, statement:SQL){const compiled=dialect.sqlToQuery(statement);return db.unsafe(compiled.sql,compiled.params as Parameters<typeof db.unsafe>[1]);}
async function mutual(rows:Opportunity[]){
  const db=postgres(url!,{max:1,onnotice:()=>{}});
  try{return await query(db,sql`
    with effective_votes(round_id,voter_id,submitter_id,points) as (values ${sql.join(rows.map(row=>sql`(${row.round},${row.voter},${row.recipient},${row.points}::int)`),sql`, `)}),
    ballot_totals as (select round_id,voter_id,sum(points)::double precision as ballot_points,count(*)::int as eligible_opportunities from effective_votes group by round_id,voter_id),
    ${mutualSupportCtes()} select * from mutual_comparisons where left_id='a' and right_id='b'
  `);}finally{await db.end();}
}
function ballot(round:string,voter:string,recipient:string,eligible:number,pointsPerSong:number):Opportunity[]{return Array.from({length:eligible},(_,i)=>({round,voter,recipient:i===0 ? recipient : `z${i}`,points:pointsPerSong}));}

describe.skipIf(!url)("relative mutual support and voting windows",()=>{
  it("keeps equal-allocation support at 1× across round sizes and ballot budgets",async()=>{
    const rows=[...ballot("r1","a","b",10,2),...ballot("r1","b","a",10,3),...ballot("r2","a","b",20,1),...ballot("r2","b","a",20,2)];
    const [pair]=await mutual(rows);
    expect(pair.points).toBe(8);expect(pair.expected_points).toBeCloseTo(8,12);expect(pair.relative_support).toBeCloseTo(1,12);expect(pair.ballot_point_share).toBeCloseTo(8/110,12);
  });
  it("counts every recipient song in expectation but each ballot budget only once",async()=>{
    const rows=[...ballot("r","a","b",5,2),...ballot("r","b","a",4,2)];
    rows[1].recipient="b";
    const [pair]=await mutual(rows);
    expect(pair.points).toBe(6);expect(pair.expected_points).toBeCloseTo(6,12);expect(pair.relative_support).toBeCloseTo(1,12);expect(pair.ballot_point_share).toBeCloseTo(6/18,12);
  });
  it("includes zero support without inventing opportunities for missing ballots",async()=>{
    const rows=ballot("r","a","b",10,2);rows[0].points=0;rows[1].points+=2;
    const [pair]=await mutual(rows);
    expect(pair.points).toBe(0);expect(pair.expected_points).toBeCloseTo(2,12);expect(pair.relative_support).toBe(0);expect(pair.opportunities).toBe(1);
    expect(await mutual(rows.map(row=>({...row,points:0})))).toEqual([]);
  });
  it("infers bracketed local-midnight windows, honors overrides, and handles the last round",async()=>{
    const db=postgres(url!,{max:1,onnotice:()=>{}}),rollback=new Error("rollback");
    try{await db.begin(async tx=>{
      await tx`set local search_path=pg_temp,public`;
      for(const table of ["leagues","rounds","submissions","votes"]){await tx.unsafe(`create temp table ${table} (like public.${table} including all) on commit drop`);await tx.unsafe(`insert into pg_temp.${table} select * from public.${table}`);}
      const [league]=await tx`select id from leagues order by id limit 1`;
      const rounds=await tx`select id from rounds where league_id=${league.id} order by ordinal`;
      const first=rounds[0].id,next=rounds[1].id,last=rounds.at(-1)!.id;
      await tx`update submissions set submitted_at='2026-07-07T21:50:00Z' where round_id in (${first},${last})`;
      await tx`update submissions set submitted_at='2026-07-12T22:10:00Z' where round_id=${next}`;
      await tx`update votes set cast_at='2026-07-12T11:00:00Z' where round_id in (${first},${last})`;
      const [voter]=await tx`select voter_id from votes where round_id=${first} limit 1`;
      await tx`update votes set cast_at='2026-07-07T22:05:00Z' where round_id in (${first},${last}) and voter_id=${voter.voter_id}`;
      await tx`update leagues set end_date='2026-07-12' where id=${league.id}`;
      const windows=()=>query(tx as unknown as ReturnType<typeof postgres>,sql`with ${voteOpportunityCtes({leagueIds:[league.id],roundIds:[first]})},${timingRoundCtes()} select * from round_windows where id in (${first},${last}) order by id`);
      let found=await windows();
      for(const window of found){expect(new Date(window.opens_at).toISOString()).toBe("2026-07-07T22:00:00.000Z");expect(new Date(window.closes_at).toISOString()).toBe("2026-07-12T22:00:00.000Z");expect(window.source).toBe("estimated");}
      const durationRows=await query(tx as unknown as ReturnType<typeof postgres>,sql`with ${voteOpportunityCtes({leagueIds:[league.id],roundIds:[first]})},${timingRoundCtes()} select window_position from ranked_ballots where cast_at='2026-07-12T11:00:00Z'`);
      expect(durationRows.length).toBeGreaterThan(0);for(const row of durationRows)expect(row.window_position).toBeCloseTo(109/120,12);
      await tx`update rounds set voting_opens_at='2026-10-24T22:00:00Z',voting_closes_at='2026-10-25T23:00:00Z' where id=${first}`;
      await tx`update votes set cast_at='2026-10-25T11:00:00Z' where round_id=${first}`;
      const timed=await query(tx as unknown as ReturnType<typeof postgres>,sql`with ${voteOpportunityCtes({leagueIds:[league.id],roundIds:[first]})},${timingRoundCtes()} select window_position,window_source from ranked_ballots`);
      expect(timed.length).toBeGreaterThan(0);for(const row of timed){expect(row.window_position).toBeCloseTo(13/25,12);expect(row.window_source).toBe("set");}
      // Overlapping next-round activity cannot establish a closing boundary.
      await tx`update rounds set voting_opens_at=null,voting_closes_at=null where id=${first}`;
      found=await windows();expect(found.find(row=>row.id===first)!.source).toBe("unavailable");
      // The latest imported round of an active, incomplete league is not its final round.
      await tx`update leagues set total_rounds=10,status='active' where id=${league.id}`;
      found=await windows();expect(found.find(row=>row.id===last)!.source).toBe("unavailable");
      await tx`update leagues set status='ended' where id=${league.id}`;
      found=await windows();expect(found.find(row=>row.id===last)!.source).toBe("estimated");
      throw rollback;
    });}catch(error){if(error!==rollback)throw error;}finally{await db.end();}
  });
});
