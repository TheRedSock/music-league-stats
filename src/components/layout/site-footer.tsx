import Link from "next/link";

import { Container } from "@/components/layout/container";

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06]">
      <Container className="flex flex-wrap items-center gap-x-5 gap-y-2 py-5 text-xs text-zinc-500">
        <a
          className="transition-colors hover:text-zinc-200"
          href="https://musicleague.com"
          rel="noreferrer"
          target="_blank"
        >
          Data from Music League
        </a>
        <a
          className="transition-colors hover:text-zinc-200"
          href="https://github.com/TheRedSock/music-league-stats"
          rel="noreferrer"
          target="_blank"
        >
          GitHub
        </a>
        <Link className="transition-colors hover:text-zinc-200" href="/faq">
          FAQ
        </Link>
        <span className="sm:ml-auto">
          Made by{" "}
          <a
            className="transition-colors hover:text-zinc-200"
            href="https://github.com/TheRedSock"
            rel="noreferrer"
            target="_blank"
          >
            TheRedSock
          </a>
        </span>
      </Container>
    </footer>
  );
}
