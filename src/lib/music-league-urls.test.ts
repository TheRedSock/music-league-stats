import { describe, expect, it } from "vitest";

import { musicLeagueUrl } from "@/lib/music-league-urls";

describe("musicLeagueUrl", () => {
  it("returns null without a configured league ID", () => {
    expect(musicLeagueUrl(null)).toBeNull();
  });

  it("builds league and round URLs", () => {
    expect(musicLeagueUrl("abc123")).toBe(
      "https://app.musicleague.com/l/abc123",
    );
    expect(musicLeagueUrl("abc123", "round-1")).toBe(
      "https://app.musicleague.com/l/abc123/round-1",
    );
  });
});
