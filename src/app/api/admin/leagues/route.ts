import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { leagues } from "@/db/schema";
import { db } from "@/db";
import {
  AdminRequestError,
  adminErrorResponse,
  requireAdminMutation,
} from "@/lib/admin-auth";
import { refreshAllLeaguesMaterialization } from "@/lib/analytics-materialize";
import { formatZodError } from "@/lib/import-data";
import { leagueInputSchema } from "@/lib/league-validation";

function databaseCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function databaseConstraint(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "constraint" in error
    ? String(error.constraint)
    : undefined;
}

export async function POST(request: NextRequest) {
  try {
    requireAdminMutation(request);
    const parsed = leagueInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AdminRequestError(formatZodError(parsed.error), 400);
    }

    const [league] = await db
      .insert(leagues)
      .values({
        ...parsed.data,
        sourceLeagueId: `manual:${randomUUID()}`,
      })
      .returning();
    const job = await refreshAllLeaguesMaterialization(undefined, {
      force: true,
    });
    if (job.status === "failed") {
      throw new AdminRequestError(
        job.errorMessage ?? "All-leagues analytics refresh failed.",
        500,
      );
    }
    revalidatePath("/admin");
    return NextResponse.json({ league }, { status: 201 });
  } catch (error) {
    if (databaseCode(error) === "23505") {
      const constraint = databaseConstraint(error);
      return NextResponse.json(
        {
          error:
            constraint === "leagues_music_league_id_unique"
              ? "That Music League ID is already in use."
              : "That slug is already in use.",
        },
        { status: 409 },
      );
    }
    return adminErrorResponse(error);
  }
}
