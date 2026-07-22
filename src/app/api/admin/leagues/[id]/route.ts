import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { leagues } from "@/db/schema";
import { revalidateAnalyticsCache } from "@/lib/analytics";
import {
  AdminRequestError,
  adminErrorResponse,
  requireAdminMutation,
} from "@/lib/admin-auth";
import { formatZodError } from "@/lib/import-data";
import { leagueInputSchema } from "@/lib/league-validation";

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
      throw new AdminRequestError("Invalid league ID.", 400);
    }
    const parsed = leagueInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AdminRequestError(formatZodError(parsed.error), 400);
    }

    const [league] = await db
      .update(leagues)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(leagues.id, id))
      .returning();
    if (!league) {
      throw new AdminRequestError("League not found.", 404);
    }
    revalidateAnalyticsCache();
    revalidatePath("/");
    revalidatePath("/songs");
    revalidatePath("/players");
    revalidatePath("/admin");
    return NextResponse.json({ league });
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
