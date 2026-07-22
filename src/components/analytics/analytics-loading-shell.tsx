import { Disc3 } from "lucide-react";

import { Container } from "@/components/layout/container";

export function AnalyticsLoadingShell() {
  return (
    <Container className="py-10 sm:py-14">
      <section aria-busy="true" aria-labelledby="loading-heading" role="status">
        <div className="flex items-center gap-3">
          <span className="relative grid size-11 place-items-center rounded-xl border border-lime-300/20 bg-lime-300/10 text-lime-300">
            <span
              aria-hidden="true"
              className="absolute inset-2 rounded-full border border-violet-300/30 motion-safe:animate-ping"
            />
            <Disc3
              aria-hidden="true"
              className="relative size-6 motion-safe:animate-spin"
            />
          </span>
          <div>
            <h1
              className="text-xl font-semibold tracking-tight text-white"
              id="loading-heading"
            >
              Loading data
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              Fetching the selected scope from the database...
            </p>
          </div>
        </div>

        <div aria-hidden="true" className="mt-9 animate-pulse space-y-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <div
                className="h-24 rounded-2xl border border-white/[0.07] bg-white/[0.025]"
                key={index}
              />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="h-80 rounded-2xl border border-white/[0.07] bg-white/[0.025]" />
            <div className="h-80 rounded-2xl border border-white/[0.07] bg-white/[0.025]" />
          </div>
        </div>
      </section>
    </Container>
  );
}
