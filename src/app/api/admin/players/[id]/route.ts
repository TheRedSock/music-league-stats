import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { competitors } from "@/db/schema";
import {
  AdminRequestError,
  adminErrorResponse,
  requireAdminMutation,
} from "@/lib/admin-auth";
import { refreshAllLeaguesMaterialization } from "@/lib/analytics-materialize";
import { formatZodError } from "@/lib/import-data";
import { playerNameInputSchema } from "@/lib/player-validation";

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireAdminMutation(request);
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) {
      throw new AdminRequestError("Invalid player ID.", 400);
    }
    const parsed = playerNameInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AdminRequestError(formatZodError(parsed.error), 400);
    }

    const [player] = await db
      .update(competitors)
      .set({ nameOverride: parsed.data.nameOverride, updatedAt: new Date() })
      .where(eq(competitors.id, id))
      .returning();
    if (!player) {
      throw new AdminRequestError("Player not found.", 404);
    }

    const job = await refreshAllLeaguesMaterialization(undefined, {
      force: true,
    });
    if (job.status === "failed") {
      throw new AdminRequestError(
        job.errorMessage ?? "All-leagues analytics refresh failed.",
        500,
      );
    }
    revalidatePath(`/players/${id}`);
    revalidatePath("/admin");
    return NextResponse.json({ player });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
