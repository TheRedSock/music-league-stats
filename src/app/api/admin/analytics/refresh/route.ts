import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AdminRequestError,
  adminErrorResponse,
  isAdminAuthenticated,
  requireAdminMutation,
} from "@/lib/admin-auth";
import {
  advanceMaterializationJob,
  getAllLeaguesMaterializationStatus,
  startMaterializationJob,
} from "@/lib/analytics-materialize";

const postBodySchema = z.object({
  action: z.enum(["start", "advance"]),
  jobId: z.uuid().optional(),
});

export async function GET() {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json(
        { error: "Your admin session has expired." },
        { status: 401 },
      );
    }
    return NextResponse.json(await getAllLeaguesMaterializationStatus());
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireAdminMutation(request);
    const parsed = postBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AdminRequestError("Invalid analytics refresh request.", 400);
    }

    if (parsed.data.action === "start") {
      return NextResponse.json(await startMaterializationJob());
    }

    if (!parsed.data.jobId) {
      throw new AdminRequestError("A jobId is required to advance refresh.", 400);
    }

    const status = await advanceMaterializationJob(parsed.data.jobId);
    if (status.status === "failed") {
      throw new AdminRequestError(
        status.job?.errorMessage ?? "All-leagues analytics refresh failed.",
        500,
      );
    }
    return NextResponse.json(status);
  } catch (error) {
    return adminErrorResponse(error);
  }
}
