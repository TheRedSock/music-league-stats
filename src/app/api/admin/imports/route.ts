import { isDeepStrictEqual } from "node:util";

import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { importBatches, leagues } from "@/db/schema";
import {
  AdminRequestError,
  adminErrorResponse,
  requireAdminMutation,
} from "@/lib/admin-auth";
import {
  createImportBatchSchema,
  formatZodError,
} from "@/lib/import-data";
import { sha256Json } from "@/lib/server-hash";

export async function POST(request: NextRequest) {
  try {
    requireAdminMutation(request);
    const parsed = createImportBatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AdminRequestError(formatZodError(parsed.error), 400);
    }
    if (sha256Json(parsed.data.manifest) !== parsed.data.checksum) {
      throw new AdminRequestError("Manifest checksum does not match.", 400);
    }
    const [league] = await db
      .select({ id: leagues.id })
      .from(leagues)
      .where(eq(leagues.id, parsed.data.leagueId))
      .limit(1);
    if (!league) throw new AdminRequestError("League not found.", 404);

    const [created] = await db
      .insert(importBatches)
      .values(parsed.data)
      .onConflictDoNothing()
      .returning();
    const batch =
      created ??
      (
        await db
          .select()
          .from(importBatches)
          .where(
            and(
              eq(importBatches.leagueId, parsed.data.leagueId),
              eq(importBatches.checksum, parsed.data.checksum),
            ),
          )
          .limit(1)
      )[0];
    if (!batch) {
      throw new AdminRequestError("Could not create the import batch.", 500);
    }
    if (!isDeepStrictEqual(batch.manifest, parsed.data.manifest)) {
      throw new AdminRequestError(
        "An import with this checksum has a different manifest.",
        409,
      );
    }
    return NextResponse.json(
      {
        batchId: batch.id,
        status: batch.status,
        summary: batch.summary,
        receivedRows: batch.receivedRows,
        receivedChunks: batch.receivedChunks,
      },
      { status: created ? 201 : 200 },
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}
