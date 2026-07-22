import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function MusicLeagueLink({
  children,
  className,
  href,
  title,
}: {
  children: ReactNode;
  className?: string;
  href: string | null;
  title?: string;
}) {
  if (!href) {
    return (
      <span className={className} title={title}>
        {children}
      </span>
    );
  }

  return (
    <a
      className={cn("inline-flex min-w-0 items-center gap-1 hover:text-lime-200", className)}
      href={href}
      rel="noreferrer"
      target="_blank"
      title={title}
    >
      <span className="truncate">{children}</span>
      <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
    </a>
  );
}
