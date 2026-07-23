import Link from "next/link";
import type { ReactNode } from "react";

import { TableHead } from "@/components/ui/table";
import {
  buildAnalyticsHref,
  type QueryValue,
} from "@/lib/analytics-url";
import type { SortDirection } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export function SortableTableHead({
  activeDirection,
  activeSort,
  align = "left",
  children,
  className,
  defaultDirection,
  params,
  path,
  sortKey,
  title,
}: {
  activeDirection: SortDirection;
  activeSort: string;
  align?: "left" | "right";
  children: ReactNode;
  className?: string;
  defaultDirection: SortDirection;
  params: Record<string, QueryValue>;
  path: string;
  sortKey: string;
  title?: string;
}) {
  const active = activeSort === sortKey;
  const nextDirection: SortDirection = active
    ? activeDirection === "desc"
      ? "asc"
      : "desc"
    : defaultDirection;
  const href = buildAnalyticsHref(path, params, {
    dir: nextDirection,
    page: null,
    q: null,
    sort: sortKey,
  });

  return (
    <TableHead
      aria-sort={
        active ? (activeDirection === "desc" ? "descending" : "ascending") : "none"
      }
      className={cn(align === "right" && "text-right", className)}
      title={title}
    >
      <Link
        className={cn(
          "inline-flex items-center gap-1 rounded-sm outline-none transition-colors hover:text-lime-200 focus-visible:ring-2 focus-visible:ring-lime-300/40",
          align === "right" && "justify-end",
          active && "text-lime-200",
        )}
        href={href}
      >
        <span>{children}</span>
        {active ? (
          <span aria-hidden="true" className="font-mono text-[10px]">
            {activeDirection === "desc" ? "v" : "^"}
          </span>
        ) : null}
      </Link>
    </TableHead>
  );
}
