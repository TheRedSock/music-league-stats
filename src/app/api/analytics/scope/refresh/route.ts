import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AdminRequestError,
  adminErrorResponse,
  requireAdminMutation,
} from "@/lib/admin-auth";
import {
  advanceScopeMaterializationJob,
  getScopeMaterializationStatus,
  hasFreshAllLeaguesMaterialization,
  startScopeMaterializationJob,
} from "@/lib/analytics-materialize";
import { analyticsScopeKey, canonicalIds } from "@/lib/analytics";

const postBodySchema = z.object({
  action: z.enum(["start", "advance", "status"]),
  jobId: z.uuid().optional(),
  leagueIds: z.array(z.uuid()).optional(),
  scopeKey: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const scopeKey = request.nextUrl.searchParams.get("scopeKey");
  if (!scopeKey) {
    return NextResponse.json({ error: "scopeKey is required." }, { status: 400 });
  }
  return NextResponse.json(await getScopeMaterializationStatus(scopeKey));
}

export async function POST(request: NextRequest) {
  try {
    const parsed = postBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid scope refresh request." }, { status: 400 });
    }

    if (parsed.data.action === "status") {
      const scopeKey =
        parsed.data.scopeKey ??
        (parsed.data.leagueIds
          ? analyticsScopeKey(canonicalIds(parsed.data.leagueIds))
          : null);
      if (!scopeKey) {
        return NextResponse.json({ error: "scopeKey is required." }, { status: 400 });
      }
      return NextResponse.json(await getScopeMaterializationStatus(scopeKey));
    }

    requireAdminMutation(request);

    if (!(await hasFreshAllLeaguesMaterialization())) {
      return NextResponse.json(
        {
          error:
            "Base analytics cache is not ready. Refresh all-leagues stats from admin first.",
        },
        { status: 409 },
      );
    }

    if (parsed.data.action === "start") {
      const leagueIds = canonicalIds(parsed.data.leagueIds ?? []);
      if (leagueIds.length < 2) {
        return NextResponse.json(
          { error: "Select at least two leagues." },
          { status: 400 },
        );
      }
      return NextResponse.json(await startScopeMaterializationJob(leagueIds));
    }

    if (!parsed.data.jobId) {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }
    const status = await advanceScopeMaterializationJob(parsed.data.jobId);
    if (status.status === "failed") {
      return NextResponse.json(
        {
          error: status.job?.errorMessage ?? "Scope materialization failed.",
          ...status,
        },
        { status: 500 },
      );
    }
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof AdminRequestError) {
      return adminErrorResponse(error);
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Scope materialization failed.",
      },
      { status: 500 },
    );
  }
}
