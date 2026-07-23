import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  AdminRequestError,
  adminErrorResponse,
  isAdminAuthenticated,
  requireAdminMutation,
} from "@/lib/admin-auth";
import {
  getAllLeaguesMaterializationStatus,
  refreshAllLeaguesMaterialization,
} from "@/lib/analytics-materialize";

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
    const job = await refreshAllLeaguesMaterialization(undefined, {
      force: true,
    });
    if (job.status === "failed") {
      throw new AdminRequestError(
        job.errorMessage ?? "All-leagues analytics refresh failed.",
        500,
      );
    }
    return NextResponse.json({
      analyticsRevision: job.analyticsRevision,
      job,
      status: job.status,
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
