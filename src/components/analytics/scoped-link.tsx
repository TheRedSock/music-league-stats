"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent } from "react";

function scopedHref(path: string, params: URLSearchParams): string {
  const next = new URLSearchParams();
  for (const league of params.getAll("league")) next.append("league", league);
  for (const round of params.getAll("round")) next.append("round", round);
  const serialized = next.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export function ScopedLink({
  href,
  onClick,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const nextHref = scopedHref(href, new URLSearchParams(window.location.search));
    if (nextHref === href) return;
    event.preventDefault();
    router.push(nextHref);
  }

  return <Link href={href} onClick={handleClick} {...props} />;
}
