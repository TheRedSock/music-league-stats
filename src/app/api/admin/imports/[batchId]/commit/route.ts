import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AdminRequestError,
  adminErrorResponse,
  requireAdminMutation,
} from "@/lib/admin-auth";
import {
  commitImportBatch,
  ImportCommitError,
  markImportFailed,
} from "@/lib/import-commit";
import { revalidateAnalyticsCache } from "@/lib/analytics";
import { invalidateAllLeaguesMaterialization } from "@/lib/analytics-materialize";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ batchId: string }> },
) {
  let batchId: string | undefined;
  try {
    requireAdminMutation(request);
    batchId = (await context.params).batchId;
    if (!z.uuid().safeParse(batchId).success) {
      throw new AdminRequestError("Invalid import batch ID.", 400);
    }
    const summary = await commitImportBatch(batchId);
    // Mark mats stale so empty-scope reads fall back to live SQL until the
    // import panel finishes /api/admin/analytics/refresh.
    await invalidateAllLeaguesMaterialization(
      undefined,
      "Invalidated after import commit.",
    );
    revalidateAnalyticsCache();
    revalidatePath("/");
    revalidatePath("/songs");
    revalidatePath("/players");
    revalidatePath("/admin");
    return NextResponse.json({ status: "completed", summary });
  } catch (error) {
    if (batchId && z.uuid().safeParse(batchId).success) {
      const message =
        error instanceof ImportCommitError
          ? error.message
          : "The atomic database merge failed. No production rows were changed.";
      await markImportFailed(batchId, message).catch(() => undefined);
      if (error instanceof ImportCommitError) {
        return NextResponse.json({ error: message }, { status: 409 });
      }
    }
    return adminErrorResponse(error);
  }
}
