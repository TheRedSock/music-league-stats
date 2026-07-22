"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname } from "next/navigation";

import { ScopedLink } from "@/components/analytics/scoped-link";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/relationships", label: "Compare" },
  { href: "/facts", label: "Facts" },
  { href: "/songs", label: "Songs" },
  { href: "/players", label: "Players" },
];

export function StaticSiteHeaderNav() {
  return (
    <nav aria-label="Main navigation" className="ml-auto">
      <ul className="flex items-center gap-1">
        {navigation.map((item) => (
          <li key={item.href}>
            <ScopedLink
              className="rounded-full px-2.5 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white sm:px-3"
              href={item.href}
            >
              {item.label}
            </ScopedLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SiteHeaderNav() {
  const pathname = usePathname();
  const onPlayerProfile = /^\/players\/[^/]+/.test(pathname);

  return (
    <nav aria-label="Main navigation" className="ml-auto">
      <ul className="flex items-center gap-1">
        {onPlayerProfile ? (
          <li>
            <ScopedLink
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/[0.05] hover:text-white sm:px-3"
              href="/players"
            >
              <ArrowLeft aria-hidden="true" className="size-3.5" />
              Back
            </ScopedLink>
          </li>
        ) : null}
        {navigation.map((item) => (
          <li key={item.href}>
            <ScopedLink
              className={cn(
                "rounded-full px-2.5 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white sm:px-3",
                (pathname === item.href || pathname.startsWith(`${item.href}/`)) &&
                  "bg-white/[0.06] text-lime-200",
              )}
              href={item.href}
            >
              {item.label}
            </ScopedLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
