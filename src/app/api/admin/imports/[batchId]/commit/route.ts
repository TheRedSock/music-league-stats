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
import { finalizeImportAnalytics, importNeedsAnalyticsRefresh } from "@/lib/import-finalize";

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ batchId: string }> },
) {
  let batchId: string | undefined;
  let committed: Awaited<ReturnType<typeof commitImportBatch>> | undefined;
  try {
    requireAdminMutation(request);
    batchId = (await context.params).batchId;
    if (!z.uuid().safeParse(batchId).success) {
      throw new AdminRequestError("Invalid import batch ID.", 400);
    }
    const summary = await commitImportBatch(batchId);
    committed = summary;
    await finalizeImportAnalytics(batchId);
    // Repeat cache revalidation even when the database receipt exists: the last
    // attempt might have lost its response or failed between these two steps.
    revalidateAnalyticsCache();
    revalidatePath("/");
    revalidatePath("/songs");
    revalidatePath("/players");
    revalidatePath("/admin");
    return NextResponse.json({ status: "completed", summary, needsRefresh: await importNeedsAnalyticsRefresh() });
  } catch (error) {
    if (committed) {
      console.error("Post-import analytics invalidation failed", { batchId });
      return NextResponse.json({ status: "completed", summary: committed, analyticsWarning: "Your import is saved, but analytics cache invalidation failed. Retry this same import to finish invalidation safely." });
    }
    if (batchId && z.uuid().safeParse(batchId).success) {
      const message =
        error instanceof ImportCommitError
          ? error.message
          : "The atomic database merge failed. No production rows were changed.";
      await markImportFailed(batchId, message).catch(() => undefined);
    }
    if (error instanceof ImportCommitError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return adminErrorResponse(error);
  }
}
