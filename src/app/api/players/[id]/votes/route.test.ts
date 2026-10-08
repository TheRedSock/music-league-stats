import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const mock = vi.hoisted(() => ({ profile: vi.fn(), ready: true, load: vi.fn() }));
vi.mock("@/lib/analytics", () => ({
  encodeScopeIds: (ids: string[]) => ids.join(","),
  getCachedFilterOptions: async () => ({}),
  getCachedPlayerProfileData: mock.profile,
  parseAnalyticsFilters: (params: unknown) => params,
  resolveAnalyticsFilter: () => ({ leagueIds: [], roundIds: [] }),
  loadAnalytics: async (loader: () => Promise<unknown>) => {
    mock.load();
    return mock.ready ? { status: "ready", data: await loader() } : { status: "building" };
  },
}));
const id = "00000000-0000-4000-8000-000000000001";
const request = (query: string, player = id) => GET(new NextRequest(`http://localhost/api/players/${player}/votes?${query}`), { params: Promise.resolve({ id: player }) });

describe("on-demand player votes", () => {
  beforeEach(() => { vi.clearAllMocks(); mock.ready = true; });
  it("rejects unbounded or malformed requests before reading analytics", async () => {
    for (const query of ["page=0", "page=Infinity", "sort=unknown", `search=${"x".repeat(161)}`]) expect((await request(query)).status).toBe(400);
    expect((await request("", "invalid")).status).toBe(400);
    expect(mock.load).not.toHaveBeenCalled();
  });
  it("returns a bounded page after searching the whole list", async () => {
    mock.profile.mockResolvedValue({ highestVotedSongs: Array.from({ length: 61 }, (_, i) => ({ title: `Song ${String(i).padStart(2,"0")}`, artist: "Björk", submitterName: "Player", roundName: "Round", leagueName: "League", pointsGiven: 1 })) });
    const response = await request("sort=title&direction=asc&page=2&search=BJ%C3%96RK");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const data = await response.json();
    expect(data).toMatchObject({ page: 2, pageCount: 3, total: 61 });
    expect(data.rows).toHaveLength(25);
    expect(data.rows[0].title).toBe("Song 25");
    expect((await (await request("search=missing")).json()).rows).toEqual([]);
  });
  it("does not serve stale profiles while a refresh is active", async () => {
    mock.ready = false;
    const response = await request("");
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("10");
    expect(mock.profile).not.toHaveBeenCalled();
  });
});
