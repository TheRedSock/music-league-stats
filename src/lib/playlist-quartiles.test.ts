import { describe, expect, it } from "vitest";

import {
  playlistQuartileIndex,
  playlistQuartileSizes,
} from "@/lib/playlist-quartiles";

describe("playlistQuartileIndex", () => {
  it("splits evenly when n is divisible by 4", () => {
    expect(playlistQuartileSizes(8)).toEqual([2, 2, 2, 2]);
    expect(playlistQuartileSizes(16)).toEqual([4, 4, 4, 4]);
    for (let i = 0; i < 8; i += 1) {
      expect(playlistQuartileIndex(i, 8)).toBe(Math.floor(i / 2));
    }
  });

  it("gives early buckets the remainder (19 → 5-5-5-4, 21 → 6-5-5-5)", () => {
    expect(playlistQuartileSizes(19)).toEqual([5, 5, 5, 4]);
    expect(playlistQuartileSizes(21)).toEqual([6, 5, 5, 5]);
    expect(playlistQuartileIndex(14, 19)).toBe(2);
    expect(playlistQuartileIndex(15, 19)).toBe(3);
    expect(playlistQuartileIndex(5, 21)).toBe(0);
    expect(playlistQuartileIndex(6, 21)).toBe(1);
  });

  it("avoids U-shaped end inflation when n ≡ 2 (mod 4)", () => {
    // Continuous percentile cuts give 3-2-3-2 for n=10; equal-count is 3-3-2-2.
    expect(playlistQuartileSizes(10)).toEqual([3, 3, 2, 2]);
    expect(playlistQuartileSizes(14)).toEqual([4, 4, 3, 3]);
  });

  it("keeps bucket sizes within 1 of each other for any n >= 4", () => {
    for (let n = 4; n <= 40; n += 1) {
      const sizes = playlistQuartileSizes(n);
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    }
  });

  it("returns null for invalid inputs", () => {
    expect(playlistQuartileIndex(-1, 10)).toBeNull();
    expect(playlistQuartileIndex(10, 10)).toBeNull();
    expect(playlistQuartileIndex(0, 1)).toBeNull();
    expect(playlistQuartileIndex(1.5, 10)).toBeNull();
  });
});
