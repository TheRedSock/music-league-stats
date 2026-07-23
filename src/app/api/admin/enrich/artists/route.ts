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
  advanceSpotifyEnrichmentJob,
  getSpotifyEnrichmentStatus,
  startSpotifyEnrichmentJob,
} from "@/lib/spotify-enrich";

const postBodySchema = z.object({
  action: z.enum(["start", "advance"]),
  jobId: z.uuid().optional(),
  ambiguousOnly: z.boolean().optional(),
});

function toResponse(status: Awaited<ReturnType<typeof getSpotifyEnrichmentStatus>>) {
  return {
    status: status.status,
    counts: status.counts,
    progress: status.progress,
    job: status.job
      ? {
          id: status.job.id,
          status: status.job.status,
          ambiguousOnly: status.job.ambiguousOnly,
          errorMessage: status.job.errorMessage,
          summary: status.job.summary as Record<string, unknown> | null | undefined,
        }
      : null,
  };
}

export async function GET() {
  try {
    if (!(await isAdminAuthenticated())) {
      return NextResponse.json(
        { error: "Your admin session has expired." },
        { status: 401 },
      );
    }
    return NextResponse.json(toResponse(await getSpotifyEnrichmentStatus()));
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireAdminMutation(request);
    const parsed = postBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AdminRequestError("Invalid Spotify enrich request.", 400);
    }

    if (parsed.data.action === "start") {
      return NextResponse.json(
        toResponse(
          await startSpotifyEnrichmentJob(parsed.data.ambiguousOnly ?? true),
        ),
      );
    }

    if (!parsed.data.jobId) {
      throw new AdminRequestError("A jobId is required to advance enrich.", 400);
    }

    const status = await advanceSpotifyEnrichmentJob(parsed.data.jobId);
    if (status.status === "failed") {
      throw new AdminRequestError(
        status.job?.errorMessage ?? "Spotify artist enrich failed.",
        500,
      );
    }
    return NextResponse.json(toResponse(status));
  } catch (error) {
    return adminErrorResponse(error);
  }
}
