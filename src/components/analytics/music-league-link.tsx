import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function MusicLeagueLink({
  children,
  className,
  href,
  title,
  showIcon = true,
}: {
  children: ReactNode;
  className?: string;
  href: string | null;
  title?: string;
  showIcon?: boolean;
}) {
  if (!href) {
    return (
      <span className={cn("block truncate", className)} title={title}>
        {children}
      </span>
    );
  }

  return (
    <a
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1 hover:text-lime-200",
        className,
      )}
      href={href}
      rel="noreferrer"
      target="_blank"
      title={title}
    >
      <span className="min-w-0 truncate">{children}</span>
      {showIcon ? (
        <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
      ) : null}
    </a>
  );
}

/** League + round labels with separate destinations and a single trailing icon. */
export function MusicLeagueScopeLinks({
  className,
  leagueHref,
  leagueLabel,
  leagueTitle,
  roundHref,
  roundLabel,
  roundTitle,
}: {
  className?: string;
  leagueHref: string | null;
  leagueLabel: ReactNode;
  leagueTitle?: string;
  roundHref: string | null;
  roundLabel: ReactNode;
  roundTitle?: string;
}) {
  const iconHref = roundHref ?? leagueHref;

  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1",
        className,
      )}
    >
      <span className="min-w-0 truncate">
        {leagueHref ? (
          <a
            className="hover:text-lime-200"
            href={leagueHref}
            rel="noreferrer"
            target="_blank"
            title={leagueTitle}
          >
            {leagueLabel}
          </a>
        ) : (
          <span title={leagueTitle}>{leagueLabel}</span>
        )}
        <span className="text-zinc-600"> · </span>
        {roundHref ? (
          <a
            className="hover:text-lime-200"
            href={roundHref}
            rel="noreferrer"
            target="_blank"
            title={roundTitle}
          >
            {roundLabel}
          </a>
        ) : (
          <span title={roundTitle}>{roundLabel}</span>
        )}
      </span>
      {iconHref ? (
        <a
          aria-label="Open in Music League"
          className="shrink-0 text-zinc-500 hover:text-lime-200"
          href={iconHref}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      ) : null}
    </span>
  );
}
