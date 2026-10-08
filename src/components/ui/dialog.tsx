"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Dialog({ children, className, description, onClose, open, title }: {
  children: ReactNode; className?: string; description?: string;
  onClose: () => void; open: boolean; title: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  return (
    <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
      }}
      className={cn("m-auto max-h-[min(90dvh,52rem)] w-[calc(100%-2rem)] max-w-3xl flex-col overflow-hidden rounded-xl border border-white/15 bg-zinc-950 p-0 text-zinc-100 shadow-xl backdrop:bg-black/70 open:flex", className)}>
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
        <div className="min-w-0 space-y-1">
          <h2 id={titleId} className="text-base font-semibold">{title}</h2>
          {description ? <p id={descriptionId} className="text-sm leading-6 text-zinc-400">{description}</p> : null}
        </div>
        <button aria-label="Close" className="shrink-0 rounded p-2 text-zinc-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-lime-300" onClick={onClose} type="button">
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="min-h-0 overflow-auto px-5 py-4 sm:px-6 sm:py-5">{open ? children : null}</div>
    </dialog>
  );
}
