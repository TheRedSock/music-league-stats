import { sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { AdminRequestError, adminErrorResponse, isAdminAuthenticated } from "@/lib/admin-auth";
import { voteOpportunityCtes } from "@/lib/analytics";
import { timingRoundCtes } from "@/lib/voting-timing-sql";

export async function GET(_request: NextRequest, context: {params: Promise<{id: string}>}) {
  try {
    if (!await isAdminAuthenticated()) throw new AdminRequestError("Admin sign-in required.",401);
    const {id}=await context.params;
    if (!z.uuid().safeParse(id).success) throw new AdminRequestError("Invalid league ID.",400);
    const rows=await db.execute(sql`
      with ${voteOpportunityCtes({leagueIds:[id],roundIds:[]})}, ${timingRoundCtes()}
      select r.id, r.name, r.ordinal, r.voting_opens_at as "opensAt", r.voting_closes_at as "closesAt",
        rw.opens_at as "estimatedOpensAt", rw.closes_at as "estimatedClosesAt", rw.source
      from rounds r join round_windows rw on rw.id=r.id where r.league_id=${id} order by r.ordinal
    `);
    return Response.json({rounds:rows},{headers:{"Cache-Control":"no-store"}});
  } catch (error) { return adminErrorResponse(error); }
}
