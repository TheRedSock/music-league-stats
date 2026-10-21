import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SortableTableHead } from "@/components/analytics/sortable-table-head";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("column sorting", () => {
  it.each([
    ["points", "asc"],
    ["title", "asc"],
    ["support-eb", "desc"],
    ["newest", "desc"],
  ] as const)("keeps the search and scope when sorting by %s", (sortKey, direction) => {
    const html = renderToStaticMarkup(SortableTableHead({
      activeDirection: "desc",
      activeSort: "points",
      defaultDirection: sortKey === "title" ? "asc" : "desc",
      params: { q: 'artist:"22" -title:live', league: ["league-a", "league-b"], round: "round-a", page: 3 },
      path: "/songs",
      sortKey,
      children: "Song column",
    }));
    const href = /href="([^"]+)"/.exec(html)![1].replaceAll("&amp;", "&");
    const query = new URL(href, "http://localhost").searchParams;
    expect(query.get("q")).toBe('artist:"22" -title:live');
    expect(query.getAll("league")).toEqual(["league-a", "league-b"]);
    expect(query.get("round")).toBe("round-a");
    expect(query.get("sort")).toBe(sortKey);
    expect(query.get("dir")).toBe(direction);
    expect(query.has("page")).toBe(false);
  });
});
