"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, type ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

function ResolvedScopedLink({ href, ...props }: Props) {
  const params = useSearchParams();
  const [path, hash] = href.split("#", 2);
  const [pathname, query = ""] = path.split("?", 2);
  const next = new URLSearchParams(query);
  if (!next.has("league")) for (const league of params.getAll("league")) next.append("league", league);
  const target = `${pathname}${next.size ? `?${next}` : ""}${hash ? `#${hash}` : ""}`;
  return <Link href={target} {...props} />;
}

export function ScopedLink(props: Props) {
  return <Suspense fallback={<Link {...props} />}><ResolvedScopedLink {...props} /></Suspense>;
}
