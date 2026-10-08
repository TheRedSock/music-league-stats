"use client";
import { useMemo } from "react";
import { useGraphSetting, graphBoolean } from "./use-graph-setting";
import { normalizedToRaw, type WeightScale } from "@/lib/relationship-graph-shared";

export function useNormalizedThreshold(scale: WeightScale, scaleKey: string, defaultNormalized?: number) {
  const view = scaleKey.split(":")[0];
  const [normalized, setNormalized] = useGraphSetting(`${view}Density`, defaultNormalized ?? scale.defaultNormalized, raw => raw.trim() !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 0 && Number(raw) <= 1 ? Number(raw) : undefined);
  const [unfiltered, setUnfiltered] = useGraphSetting(`${view}All`, false, graphBoolean);
  const rawThreshold = useMemo(() => unfiltered ? scale.low : normalizedToRaw(normalized, scale), [normalized, scale, unfiltered]);
  return { normalized, rawThreshold, setNormalized, unfiltered, setUnfiltered };
}
