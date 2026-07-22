import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "muted";

const variants: Record<BadgeVariant, string> = {
  default: "border-violet-300/20 bg-violet-300/10 text-violet-200",
  success: "border-lime-300/20 bg-lime-300/10 text-lime-200",
  muted: "border-white/10 bg-white/[0.04] text-zinc-400",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium tracking-wide",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
