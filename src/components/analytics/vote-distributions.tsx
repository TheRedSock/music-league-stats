"use client";

import { useState } from "react";

import {
  PointDistributionSection,
  RangeToggle,
} from "@/components/analytics/point-distribution-chart";
import type { PointBucket, PointBucketRange } from "@/lib/point-buckets";

export function VoteDistributions({
  received,
  given,
}: {
  received: PointBucket[];
  given: PointBucket[];
}) {
  const [range, setRange] = useState<PointBucketRange>("standard");

  return (
    <div>
      <div className="mb-6">
        <RangeToggle onChange={setRange} range={range} />
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <PointDistributionSection
          buckets={received}
          range={range}
          title="Points received"
        />
        <PointDistributionSection
          buckets={given}
          range={range}
          title="Points given"
        />
      </div>
    </div>
  );
}
