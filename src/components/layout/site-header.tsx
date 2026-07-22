import { Disc3, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { ScopedLink } from "@/components/analytics/scoped-link";
import { Container } from "@/components/layout/container";
import { SiteHeaderNav, StaticSiteHeaderNav } from "@/components/layout/site-header-nav";
import { buttonStyles } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-zinc-950/75 backdrop-blur-xl">
      <Container className="flex h-16 items-center justify-between gap-2 sm:gap-6">
        <ScopedLink
          className="flex shrink-0 items-center gap-2.5"
          href="/"
          aria-label="Music League Tracker home"
        >
          <span className="grid size-9 place-items-center rounded-xl border border-lime-300/20 bg-lime-300/10 text-lime-300">
            <Disc3 aria-hidden="true" className="size-5" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-white sm:text-base">
            Music League Tracker
          </span>
        </ScopedLink>

        <Suspense fallback={<StaticSiteHeaderNav />}>
          <SiteHeaderNav />
        </Suspense>

        <Link
          className={buttonStyles({
            variant: "secondary",
            size: "sm",
            className: "hidden sm:inline-flex",
          })}
          href="/admin"
        >
          <LockKeyhole aria-hidden="true" className="size-3.5" />
          Admin
        </Link>
      </Container>
    </header>
  );
}
