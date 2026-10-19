import { describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Database } from "@/db";
import { getPlayerProfileData, getRelationshipsTableData } from "@/lib/analytics";
import { startMaterializationJob, advanceMaterializationJob } from "@/lib/analytics-materialize";
import { analyticsProgressKey } from "@/lib/analytics-job-progress";

const active=vi.hoisted(()=>({database:null as Database|null}));
vi.mock("next/server",()=>({after:vi.fn()}));
vi.mock("@/db",()=>({db:new Proxy({}, {get:(_target,key)=>{
  if(!active.database)throw new Error("Test transaction not selected");
  const value=Reflect.get(active.database,key);
  return typeof value === "function" ? value.bind(active.database) : value;
}})}));
const url=process.env.ANALYTICS_TEST_DATABASE_URL;
const inputs=["leagues","competitors","league_members","rounds","submissions","votes"];
const outputs=["analytics_materialization_jobs","analytics_scope_jobs","analytics_effective_votes","analytics_song_stats","analytics_player_stats","analytics_point_distribution","analytics_player_point_distribution","analytics_relationship_pairs","analytics_relationship_mutual","analytics_relationship_alignment","analytics_player_timing"];

describe.skipIf(!url)("relationship metric read paths",()=>{
  it("keeps live/cached tables and profiles consistent, with sortable missing-ballot fractions",async()=>{
    const client=postgres(url!,{max:1,onnotice:()=>{}}),rollback=new Error("rollback fixture");
    try{await drizzle(client,{schema}).transaction(async tx=>{
      await tx.execute(sql`set local search_path=pg_temp,public`);
      for(const table of [...inputs,...outputs]){
        await tx.execute(sql.raw(`create temp table ${table} (like public.${table} including all) on commit drop`));
        if(inputs.includes(table))await tx.execute(sql.raw(`insert into pg_temp.${table} select * from public.${table}`));
      }
      active.database=tx as unknown as Database;
      const [player]=await tx.select({id:schema.competitors.id}).from(schema.competitors).limit(1);
      const [round]=await tx.select({id:schema.rounds.id,date:schema.rounds.sourceCreatedAt}).from(schema.rounds).limit(1);
      await tx.execute(sql`update rounds set voting_opens_at=${new Date(+round.date-3600000).toISOString()}::timestamptz,voting_closes_at=${new Date(+round.date+3600000).toISOString()}::timestamptz where id=${round.id}`);
      await tx.execute(sql`delete from votes where voter_id=${player.id} and round_id=${round.id}`);
      const filter={leagueIds:[],roundIds:[]};
      const liveProfile=await getPlayerProfileData(player.id,filter);
      const liveMutual=await getRelationshipsTableData(filter,{tab:"mutual",sort:"mutual-support",direction:"desc",focusPlayerId:null});
      const liveTiming=await getRelationshipsTableData(filter,{tab:"timing",sort:"missed-rate",direction:"desc",focusPlayerId:null});
      expect(liveProfile).not.toBeNull();expect(liveMutual.rows.length).toBeGreaterThan(0);
      expect(liveTiming.rows[0].leftId).toBe(player.id);
      expect(liveTiming.rows[0].missedRate).toBeCloseTo(1/16,12);
      let job=await startMaterializationJob(active.database);
      for(let i=0;job.status==="processing" && i<100;i++)job=await advanceMaterializationJob(job.job!.id,active.database,analyticsProgressKey(job.progress));
      expect(job.job?.errorMessage).toBeNull();expect(job.status).toBe("completed");
      const cachedProfile=await getPlayerProfileData(player.id,filter);
      const cachedMutual=await getRelationshipsTableData(filter,{tab:"mutual",sort:"mutual-support",direction:"desc",focusPlayerId:null});
      const cachedTiming=await getRelationshipsTableData(filter,{tab:"timing",sort:"missed-rate",direction:"desc",focusPlayerId:null});
      expect(cachedMutual.rows.map(row=>[row.leftId,row.rightId])).toEqual(liveMutual.rows.map(row=>[row.leftId,row.rightId]));
      for(let i=0;i<liveMutual.rows.length;i++){
        expect(cachedMutual.rows[i].relativeSupport).toBeCloseTo(liveMutual.rows[i].relativeSupport!,12);
        expect(cachedMutual.rows[i].ballotPointShare).toBeCloseTo(liveMutual.rows[i].ballotPointShare!,12);
      }
      for(const row of liveTiming.rows){
        const stored=cachedTiming.rows.find(candidate=>candidate.leftId===row.leftId)!;
        expect(stored.missedRate).toBe(row.missedRate);expect(stored.windowTimedRounds).toBe(row.windowTimedRounds);
        expect(stored.averageCombinedTiming).toBeCloseTo(row.averageCombinedTiming!,12);
      }
      for(const row of liveProfile!.mutualRelationships)expect(cachedProfile!.mutualRelationships.find(other=>other.competitorId===row.competitorId)?.relativeSupport).toBeCloseTo(row.relativeSupport!,12);
      for(const row of liveProfile!.timing){
        const stored=cachedProfile!.timing.find(other=>other.roundId===row.roundId)!;
        expect(stored.windowPosition).toBe(row.windowPosition);expect(stored.windowSource).toBe(row.windowSource);
      }
      throw rollback;
    });}catch(error){if(error!==rollback)throw error;}finally{active.database=null;await client.end();}
  },30_000);
});
