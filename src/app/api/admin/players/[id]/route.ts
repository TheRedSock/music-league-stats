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
import { invalidateAllLeaguesMaterialization } from "@/lib/analytics-materialize";
import { formatZodError } from "@/lib/import-data";
import { playerPath } from "@/lib/player-slug";
import { playerNameInputSchema } from "@/lib/player-validation";

function databaseCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

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

    const previous = await db
      .select({
        id: competitors.id,
        slug: competitors.slug,
        nameOverride: competitors.nameOverride,
      })
      .from(competitors)
      .where(eq(competitors.id, id))
      .limit(1);
    if (!previous[0]) {
      throw new AdminRequestError("Player not found.", 404);
    }

    const [player] = await db
      .update(competitors)
      .set({
        nameOverride: parsed.data.nameOverride,
        slug: parsed.data.slug,
        updatedAt: new Date(),
      })
      .where(eq(competitors.id, id))
      .returning();
    if (!player) {
      throw new AdminRequestError("Player not found.", 404);
    }

    // Mats store display names, not slugs (slug is joined at read time).
    // Only a name-override change needs a full analytics rebuild.
    const nameOverrideChanged =
      previous[0].nameOverride !== parsed.data.nameOverride;
    if (nameOverrideChanged) {
      await invalidateAllLeaguesMaterialization(
        undefined,
        "Invalidated after player display name update.",
      );
    }
    revalidatePath(playerPath(player));
    if (previous[0].slug !== player.slug) {
      revalidatePath(playerPath(previous[0]));
    }
    revalidatePath(`/players/${player.id}`);
    revalidatePath("/admin");
    return NextResponse.json({ player });
  } catch (error) {
    if (databaseCode(error) === "23505") {
      return NextResponse.json(
        { error: "That slug is already in use." },
        { status: 409 },
      );
    }
    return adminErrorResponse(error);
  }
}
