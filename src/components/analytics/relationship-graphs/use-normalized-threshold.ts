"use client";

import { useEffect, useMemo, useState } from "react";

import type { WeightScale } from "@/lib/relationship-graph-shared";
import { normalizedToRaw } from "@/lib/relationship-graph-shared";

/**
 * Slider state in normalized [0,1] space mapped through a robust WeightScale.
 * Resets when the distribution identity changes. Optional override replaces the
 * scale's built-in default (e.g. matrix hide-at-0%, bubbles more aggressive).
 */
export function useNormalizedThreshold(
  scale: WeightScale,
  scaleKey: string,
  defaultNormalized?: number,
) {
  const resolvedDefault = defaultNormalized ?? scale.defaultNormalized;
  const [normalized, setNormalized] = useState(resolvedDefault);

  useEffect(() => {
    setNormalized(resolvedDefault);
  }, [scaleKey, resolvedDefault]);

  const rawThreshold = useMemo(
    () => normalizedToRaw(normalized, scale),
    [normalized, scale],
  );

  return {
    normalized,
    rawThreshold,
    setNormalized,
  };
}
