import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { encodeScopeIds, getCachedFilterOptions, getCachedPlayerProfileData, loadAnalytics, parseAnalyticsFilters, resolveAnalyticsFilter } from "@/lib/analytics";
import { selectVotedSongs, voteSortKeys } from "@/lib/voted-songs";

const querySchema = z.object({
  search: z.string().max(160).default(""),
  minPoints: z.coerce.number().int().min(0).max(1000).default(0),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  sort: z.enum(voteSortKeys).default("points"),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!z.uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Invalid vote search." }, { status: 400 });
  const result = await loadAnalytics(async () => {
    const options = await getCachedFilterOptions();
    const filter = resolveAnalyticsFilter(parseAnalyticsFilters({ league: request.nextUrl.searchParams.getAll("league"), round: request.nextUrl.searchParams.getAll("round") }), options);
    const profile = await getCachedPlayerProfileData(id, encodeScopeIds(filter.leagueIds), encodeScopeIds(filter.roundIds));
    return profile ? selectVotedSongs(profile.highestVotedSongs, parsed.data) : null;
  });
  if (result.status !== "ready") return NextResponse.json({ error: "Analytics unavailable." }, { status: 503, headers: { "Retry-After": "10", "Cache-Control": "no-store" } });
  if (!result.data) return NextResponse.json({ error: "Player not found." }, { status: 404 });
  return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
}
