"use client";

import { usePathname } from "next/navigation";

import { ScopedLink } from "@/components/analytics/scoped-link";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/relationships", label: "Compare" },
  { href: "/relationships/graphs", label: "Graphs" },
  { href: "/facts", label: "Facts" },
  { href: "/songs", label: "Songs" },
  { href: "/players", label: "Players" },
];

function navItemActive(pathname: string, href: string): boolean {
  // Compare owns exact /relationships only; Graphs owns /relationships/graphs.
  if (href === "/relationships") return pathname === "/relationships";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function StaticSiteHeaderNav() {
  return (
    <nav aria-label="Main navigation" className="order-last w-full min-w-0 md:order-none md:ml-auto md:w-auto">
      <ul className="grid grid-cols-5 items-center gap-1 md:flex">
        {navigation.map((item) => (
          <li key={item.href}>
            <ScopedLink
              className="inline-flex w-full justify-center rounded px-1.5 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white sm:px-3"
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

  return (
    <nav aria-label="Main navigation" className="order-last w-full min-w-0 md:order-none md:ml-auto md:w-auto">
      <ul className="grid grid-cols-5 items-center gap-1 md:flex">
        {navigation.map((item) => (
          <li key={item.href}>
            <ScopedLink
              className={cn(
                "inline-flex w-full justify-center rounded px-1.5 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white sm:px-3",
                navItemActive(pathname, item.href) &&
                  "bg-white/[0.06] text-lime-200",
              )}
              aria-current={navItemActive(pathname, item.href) ? "page" : undefined}
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
