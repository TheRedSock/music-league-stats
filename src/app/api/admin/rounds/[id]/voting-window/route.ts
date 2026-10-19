import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db, type Database } from "@/db";
import { rounds } from "@/db/schema";
import { AdminRequestError, adminErrorResponse, requireAdminMutation } from "@/lib/admin-auth";
import { invalidateScopesContainingLeague } from "@/lib/analytics-materialize";
import { votingWindowSchema } from "@/lib/voting-timing";

export async function PUT(request: NextRequest, context: {params: Promise<{id:string}>}) {
  try {
    requireAdminMutation(request);
    const {id}=await context.params;
    if (!z.uuid().safeParse(id).success) throw new AdminRequestError("Invalid round ID.",400);
    const body=await request.text();
    if (body.length>1024) throw new AdminRequestError("Voting window request is too large.",413);
    let input: unknown;
    try { input=JSON.parse(body); } catch { throw new AdminRequestError("Invalid JSON.",400); }
    const parsed=votingWindowSchema.safeParse(input);
    if (!parsed.success) throw new AdminRequestError(parsed.error.issues[0].message,400);
    await db.transaction(async tx=>{
      const [round]=await tx.update(rounds).set({
        votingOpensAt:parsed.data.opensAt ? new Date(parsed.data.opensAt) : null,
        votingClosesAt:parsed.data.closesAt ? new Date(parsed.data.closesAt) : null, updatedAt:new Date(),
      }).where(eq(rounds.id,id)).returning({leagueId:rounds.leagueId});
      if (!round) throw new AdminRequestError("Round not found.",404);
      await invalidateScopesContainingLeague(round.leagueId,tx as unknown as Database,"Voting window updated. Refresh analytics to recalculate timing.");
    });
    revalidatePath("/admin");
    return Response.json({message:"Saved. Refresh analytics to update timing."});
  } catch (error) { return adminErrorResponse(error); }
}
