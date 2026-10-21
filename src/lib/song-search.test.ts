import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { parseSongSearch, songSearchPredicate } from "@/lib/song-search";

const compile = (search: string) => new PgDialect().sqlToQuery(songSearchPredicate(search));

describe("song search", () => {
  it("restricts a quoted artist to an exact name instead of matching titles or longer names", () => {
    expect(parseSongSearch('artist:"22"')).toEqual([
      { field: "artist", value: "22", exact: true, exclude: false },
    ]);
    const query = compile('artist:"22"');
    expect(query.sql).toBe("((lower(ranked_songs.artist) = lower($1)))");
    expect(query.params).toEqual(["22"]);
  });

  it.each([
    ["artist", "artist"], ["title", "title"], ["song", "title"],
    ["album", "album"], ["player", "player"], ["submitter", "player"],
    ["league", "league"], ["round", "round"],
  ])("recognizes the %s field, ignoring case", (prefix, field) => {
    expect(parseSongSearch(`${prefix.toUpperCase()}:example`)).toEqual([
      { field, value: "example", exact: false, exclude: false },
    ]);
  });

  it("combines field filters, ordinary words, quoted phrases, and exclusions", () => {
    expect(parseSongSearch('artist:"22" title:light "new song" -album:live -remix')).toEqual([
      { field: "artist", value: "22", exact: true, exclude: false },
      { field: "title", value: "light", exact: false, exclude: false },
      { field: null, value: "new song", exact: false, exclude: false },
      { field: "album", value: "live", exact: false, exclude: true },
      { field: null, value: "remix", exact: false, exclude: true },
    ]);
    const query = compile('artist:"22" title:light -album:live');
    expect(query.sql).toContain(" and (ranked_songs.title ilike $2) and not (coalesce(ranked_songs.album, '') ilike $3)");
    expect(query.params).toEqual(["22", "%light%", "%live%"]);
  });

  it("searches plain text across song, artist, album and player", () => {
    const query = compile('"22 minutes"');
    expect(query.sql).toContain("ranked_songs.title ilike $1 or ranked_songs.artist ilike $2");
    expect(query.sql).toContain("coalesce(ranked_songs.album, '') ilike $3");
    expect(query.sql).toContain('ranked_songs."submitterName" ilike $4');
    expect(query.params).toEqual(Array(4).fill("%22 minutes%"));
  });

  it("treats unsupported operators and bare prefixes as ordinary text", () => {
    for (const value of ["genre:rock", "artist:", "constructor:foo", "https://example.com"]) {
      expect(parseSongSearch(value)).toEqual([
        { field: null, value, exact: false, exclude: false },
      ]);
    }
  });

  it("handles empty and unfinished quoted input without errors", () => {
    expect(compile("  ").sql).toBe("true");
    expect(compile('artist:""').sql).toBe("true");
    expect(parseSongSearch('artist:"pink floyd')).toEqual([
      { field: "artist", value: "pink floyd", exact: false, exclude: false },
    ]);
  });

  it("supports escaped quotes in names", () => {
    expect(compile(String.raw`artist:"The \"22\" Band"`).params).toEqual(['The "22" Band']);
  });

  it("parameterizes search values and treats SQL wildcards literally", () => {
    const value = String.raw`100%_\mix`;
    expect(compile(`title:${value}`).params).toEqual([String.raw`%100\%\_\\mix%`]);
    const query = compile('artist:"x\' OR true --"');
    expect(query.params).toEqual(["x' OR true --"]);
    expect(query.sql).not.toContain("OR true");
    expect(compile('artist:"100%_"').params).toEqual(["100%_"]);
  });
});
