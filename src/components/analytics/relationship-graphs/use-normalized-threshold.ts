"use client";

import { useMemo, useState } from "react";

import type { WeightScale } from "@/lib/relationship-graph-shared";
import { normalizedToRaw } from "@/lib/relationship-graph-shared";

/**
 * Slider state mapped through the view's quantile or per-player density scale.
 * Resets when the distribution identity changes. Optional override replaces the
 * scale's density-based default (e.g. matrix starts unfiltered).
 */
export function useNormalizedThreshold(
  scale: WeightScale,
  scaleKey: string,
  defaultNormalized?: number,
) {
  const resolvedDefault = defaultNormalized ?? scale.defaultNormalized;
  const [normalized, setNormalized] = useState(resolvedDefault);
  const [trackedKey, setTrackedKey] = useState(scaleKey);
  const [unfiltered, setUnfiltered] = useState(false);

  // Adjust state during render when the scale identity changes (React-recommended
  // replacement for syncing via useEffect).
  if (trackedKey !== scaleKey) {
    setTrackedKey(scaleKey);
    setNormalized(resolvedDefault);
    setUnfiltered(false);
  }

  const rawThreshold = useMemo(
    () => unfiltered ? scale.low : normalizedToRaw(normalized, scale),
    [normalized, scale, unfiltered],
  );

  return {
    normalized,
    rawThreshold,
    setNormalized,
    unfiltered,
    setUnfiltered,
  };
}
