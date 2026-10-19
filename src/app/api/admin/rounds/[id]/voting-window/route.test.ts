import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state=vi.hoisted(()=>({deny:false,found:true,transaction:vi.fn(),update:vi.fn(),set:vi.fn(),invalidate:vi.fn()}));
vi.mock("@/lib/admin-auth",()=>({
  AdminRequestError:class extends Error{constructor(message:string,public status:number){super(message);}},
  requireAdminMutation:()=>{if(state.deny)throw Object.assign(new Error("Sign-in required"),{status:401});},
  adminErrorResponse:(error:Error&{status?:number})=>Response.json({error:error.message},{status:error.status??500}),
}));
vi.mock("@/db",()=>({db:{transaction:state.transaction}}));
vi.mock("@/lib/analytics-materialize",()=>({invalidateScopesContainingLeague:state.invalidate}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
import { PUT } from "./route";

const id="6d2a7d75-c604-4916-857f-2c53d10c66e0",league="9da207e6-59bd-4739-a0bb-dc7bcb152426";
const times={opensAt:"2026-07-08T00:00:00+02:00",closesAt:"2026-07-13T00:00:00+02:00"};
const request=(body:unknown)=>new NextRequest(`http://localhost/api/admin/rounds/${id}/voting-window`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{
  vi.clearAllMocks();state.deny=false;state.found=true;
  state.set.mockReturnValue({where:()=>({returning:async()=>state.found?[{leagueId:league}]:[]})});
  state.update.mockReturnValue({set:state.set});
  state.transaction.mockImplementation(async work=>work({update:state.update}));
});
describe("voting-window edits",()=>{
  it("requires admin authorization before accessing the database",async()=>{
    state.deny=true;expect((await PUT(request(times),{params:Promise.resolve({id})})).status).toBe(401);expect(state.transaction).not.toHaveBeenCalled();
  });
  it("rejects partial, backwards, oversized, or invalid-ID changes",async()=>{
    for(const body of [{...times,closesAt:null},{...times,closesAt:times.opensAt},{opensAt:"x".repeat(1500),closesAt:null}]){
      const response=await PUT(request(body),{params:Promise.resolve({id})});expect([400,413]).toContain(response.status);
    }
    expect((await PUT(request(times),{params:Promise.resolve({id:"invalid"})})).status).toBe(400);
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("updates exact instants and invalidates within the same transaction",async()=>{
    expect((await PUT(request(times),{params:Promise.resolve({id})})).status).toBe(200);
    expect(state.set).toHaveBeenCalledWith(expect.objectContaining({votingOpensAt:new Date(times.opensAt),votingClosesAt:new Date(times.closesAt)}));
    expect(state.invalidate).toHaveBeenCalledWith(league,expect.objectContaining({update:state.update}),expect.any(String));
  });
  it("clears overrides together and does not invalidate a missing round",async()=>{
    expect((await PUT(request({opensAt:null,closesAt:null}),{params:Promise.resolve({id})})).status).toBe(200);
    expect(state.set).toHaveBeenCalledWith(expect.objectContaining({votingOpensAt:null,votingClosesAt:null}));
    state.found=false;state.invalidate.mockClear();expect((await PUT(request(times),{params:Promise.resolve({id})})).status).toBe(404);expect(state.invalidate).not.toHaveBeenCalled();
  });
});
