import { Disc3, LockKeyhole } from "lucide-react";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { buttonStyles } from "@/components/ui/button";

const navigation = [
  { href: "/songs", label: "Songs" },
  { href: "/players", label: "Players" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-zinc-950/75 backdrop-blur-xl">
      <Container className="flex h-16 items-center justify-between gap-2 sm:gap-6">
        <Link
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
        </Link>

        <nav aria-label="Main navigation" className="ml-auto">
          <ul className="flex items-center gap-1">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  className="rounded-full px-2.5 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white sm:px-3"
                  href={item.href}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

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
