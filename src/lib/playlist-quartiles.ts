/**
 * Equal-count playlist quartiles for position-bias analysis.
 *
 * Split a slate of size `n` into four buckets whose sizes differ by at most 1.
 * When `n` is not divisible by 4, extra slots go to earlier buckets first:
 *   n=19 → 5-5-5-4,  n=21 → 6-5-5-5,  n=10 → 3-3-2-2
 *
 * This avoids the continuous percentile cut `index/(n-1)` with thresholds at
 * 0.25/0.5/0.75, which puts exact boundaries into later buckets and systematically
 * inflates 75–100% when n ≡ 1 (mod 4), and both ends when n ≡ 2 (mod 4).
 */
export function playlistQuartileIndex(
  playlistIndex: number,
  slateSize: number,
): 0 | 1 | 2 | 3 | null {
  if (
    !Number.isInteger(playlistIndex) ||
    !Number.isInteger(slateSize) ||
    playlistIndex < 0 ||
    slateSize < 2 ||
    playlistIndex >= slateSize
  ) {
    return null;
  }

  // Degenerate slates: still assign without empty buckets when possible.
  if (slateSize < 4) {
    return Math.min(3, Math.floor((playlistIndex * 4) / slateSize)) as
      | 0
      | 1
      | 2
      | 3;
  }

  const base = Math.floor(slateSize / 4);
  const rem = slateSize % 4;
  // First `rem` buckets have size base+1; the rest have size base.
  const largeSpan = rem * (base + 1);
  if (playlistIndex < largeSpan) {
    return Math.floor(playlistIndex / (base + 1)) as 0 | 1 | 2 | 3;
  }
  return Math.min(
    3,
    rem + Math.floor((playlistIndex - largeSpan) / base),
  ) as 0 | 1 | 2 | 3;
}

export const PLAYLIST_QUARTILE_LABELS = [
  "0-25%",
  "25-50%",
  "50-75%",
  "75-100%",
] as const;

export function playlistQuartileLabel(
  quartile: 0 | 1 | 2 | 3,
): (typeof PLAYLIST_QUARTILE_LABELS)[number] {
  return PLAYLIST_QUARTILE_LABELS[quartile];
}

/** Expected song counts per quartile for a slate of size n (for tests / docs). */
export function playlistQuartileSizes(slateSize: number): [number, number, number, number] {
  if (slateSize < 4) {
    const sizes: [number, number, number, number] = [0, 0, 0, 0];
    for (let i = 0; i < slateSize; i += 1) {
      const q = playlistQuartileIndex(i, slateSize);
      if (q != null) sizes[q] += 1;
    }
    return sizes;
  }
  const base = Math.floor(slateSize / 4);
  const rem = slateSize % 4;
  return [
    base + (rem > 0 ? 1 : 0),
    base + (rem > 1 ? 1 : 0),
    base + (rem > 2 ? 1 : 0),
    base,
  ];
}
