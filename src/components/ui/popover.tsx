"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Native top-layer placement escapes table overflow and supports light dismiss/Escape. */
export function Popover({ label, trigger, children, className, triggerClassName }: {
  label: string; trigger: ReactNode; children: ReactNode; className?: string; triggerClassName?: string;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  function position() {
    if (!panel.current || !button.current) return;
    const box = button.current.getBoundingClientRect();
    const width = panel.current.offsetWidth;
    const height = panel.current.offsetHeight;
    panel.current.style.left = `${Math.max(12, Math.min(box.right - width, window.innerWidth - width - 12))}px`;
    panel.current.style.top = `${Math.max(12, Math.min(box.bottom + 8, window.innerHeight - height - 12))}px`;
  }
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [open]);
  return (
    <>
      <button ref={button} popoverTarget={id} aria-controls={id} aria-expanded={open} aria-haspopup="dialog" type="button" className={buttonStyles({ variant: "secondary", className: triggerClassName })}>
        {trigger}
      </button>
      <div ref={panel} id={id} popover="auto" role="dialog" aria-label={label}
        className={cn("fixed m-0 max-h-[calc(100dvh-24px)] w-64 max-w-[calc(100vw-24px)] overflow-y-auto rounded-lg border border-white/15 bg-zinc-950 p-3 text-zinc-100 shadow-xl", className)}
        onToggle={(event) => {
          const isOpen = event.newState === "open";
          setOpen(isOpen);
          if (isOpen) { position(); panel.current?.querySelector<HTMLElement>("input, button, a, select")?.focus(); }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault(); panel.current?.hidePopover(); button.current?.focus();
          }
        }}>
        {children}
      </div>
    </>
  );
}
