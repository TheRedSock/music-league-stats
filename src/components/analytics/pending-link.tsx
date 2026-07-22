"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { useTransition } from "react";

import { cn } from "@/lib/utils";

export function PendingLink({
  children,
  className,
  href,
  pendingLabel = "Loading",
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & {
  children: ReactNode;
  href: string;
  pendingLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    props.onClick?.(event);
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
    event.preventDefault();
    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <Link
      {...props}
      aria-busy={pending}
      className={cn("inline-flex min-w-0 items-center gap-1.5", className)}
      href={href}
      onClick={handleClick}
    >
      {pending ? (
        <LoaderCircle
          aria-label={pendingLabel}
          className="size-3.5 shrink-0 animate-spin text-lime-300"
        />
      ) : null}
      {children}
    </Link>
  );
}
