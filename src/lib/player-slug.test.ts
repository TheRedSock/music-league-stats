import { describe, expect, it } from "vitest";

import {
  allocateUniquePlayerSlug,
  playerPath,
  slugifyPlayerName,
} from "@/lib/player-slug";

describe("slugifyPlayerName", () => {
  it("lowercases and replaces non-alphanumeric runs with hyphens", () => {
    expect(slugifyPlayerName("Havrd")).toBe("havrd");
    expect(slugifyPlayerName("  Cool_Player!! ")).toBe("cool-player");
    expect(slugifyPlayerName("Ann-Marie")).toBe("ann-marie");
  });

  it("strips diacritics and falls back when empty", () => {
    expect(slugifyPlayerName("Håvard")).toBe("havard");
    expect(slugifyPlayerName("!!!")).toBe("player");
    expect(slugifyPlayerName("")).toBe("player");
  });
});

describe("allocateUniquePlayerSlug", () => {
  it("returns the base slug when free, then -2, -3, …", () => {
    const used = new Set<string>();
    expect(allocateUniquePlayerSlug("Bob", used)).toBe("bob");
    expect(allocateUniquePlayerSlug("Bob", used)).toBe("bob-2");
    expect(allocateUniquePlayerSlug("Bob", used)).toBe("bob-3");
    expect(used.has("bob-2")).toBe(true);
  });

  it("skips a taken -2 suffix", () => {
    const used = new Set(["alice", "alice-2"]);
    expect(allocateUniquePlayerSlug("Alice", used)).toBe("alice-3");
  });
});

describe("playerPath", () => {
  it("prefers slug over id", () => {
    expect(playerPath({ id: "uuid-1", slug: "havrd" })).toBe("/players/havrd");
    expect(playerPath({ id: "uuid-1", slug: null })).toBe("/players/uuid-1");
  });
});
