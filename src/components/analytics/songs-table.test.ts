import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SONG_TABLE_COLUMNS,
  SONG_TABLE_COLUMN_IDS,
  useSongTableColumns,
} from "@/components/analytics/songs-column-picker";
import { SongsTable } from "@/components/analytics/songs-table";
import { songSorts, type SongSort, type SortDirection } from "@/lib/analytics-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/analytics/songs-column-picker", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/analytics/songs-column-picker")>(),
  useSongTableColumns: vi.fn(),
}));

function renderTable(sort: SongSort = "points", direction: SortDirection = "desc") {
  return renderToStaticMarkup(createElement(SongsTable, {
    currentParams: { q: 'artist:"22"', sort, dir: direction, page: 3 },
    direction,
    rows: [],
    sort,
  }));
}

function sortLinks(html: string) {
  return Array.from(html.matchAll(/href="([^"]+)"/g), (match) =>
    new URL(match[1].replaceAll("&amp;", "&"), "http://localhost"),
  );
}

describe("song table sort controls", () => {
  beforeEach(() => {
    vi.mocked(useSongTableColumns).mockReturnValue({
      columns: [...DEFAULT_SONG_TABLE_COLUMNS],
      toggle: vi.fn(),
      isVisible: (column) => DEFAULT_SONG_TABLE_COLUMNS.includes(column),
    });
  });

  it("makes every supported sort available through a fixed or opt-in column", () => {
    vi.mocked(useSongTableColumns).mockReturnValue({
      columns: [...SONG_TABLE_COLUMN_IDS], toggle: vi.fn(), isVisible: () => true,
    });
    const sorts = sortLinks(renderTable()).map((url) => url.searchParams.get("sort"));
    expect(sorts.sort()).toEqual([...songSorts].sort());
  });

  it("keeps submission date opt-in by default", () => {
    expect(SONG_TABLE_COLUMN_IDS).toContain("newest");
    expect(sortLinks(renderTable()).some((url) => url.searchParams.get("sort") === "newest")).toBe(false);
  });

  it.each([['desc', 'asc'], ['asc', 'desc']] as const)(
    "shows an active date sort from an existing URL and toggles %s to %s",
    (direction, nextDirection) => {
      const html = renderTable("newest", direction);
      const link = sortLinks(html).find((url) => url.searchParams.get("sort") === "newest");
      expect(html).toContain("Submitted");
      expect(link?.searchParams.get("dir")).toBe(nextDirection);
      expect(link?.searchParams.get("q")).toBe('artist:"22"');
      expect(link?.searchParams.has("page")).toBe(false);
    },
  );
});
