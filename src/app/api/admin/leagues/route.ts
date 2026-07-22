import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { leagues } from "@/db/schema";
import { db } from "@/db";
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
    revalidateAnalyticsCache();
    revalidatePath("/");
    revalidatePath("/songs");
    revalidatePath("/players");
    revalidatePath("/admin");
    return NextResponse.json({ league }, { status: 201 });
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
