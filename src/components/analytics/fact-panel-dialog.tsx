"use client";

import { useRef, useState, type ReactNode } from "react";
import Form from "next/form";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { FactDetail } from "@/lib/detail-pagination";

function DetailLinkLabel({ count }: { count: number }) {
  const { pending } = useLinkStatus();
  return <span aria-live="polite">{pending ? "Loading list…" : `View all (${count})`}</span>;
}

export function FactPanelDialog({ children, description, dialogClassName, itemCount, title, detail }: {
  children: ReactNode; description: string; dialogClassName?: string; itemCount: number; title: string; detail: FactDetail;
}) {
  const router = useRouter();
  const trigger = useRef<HTMLAnchorElement>(null);
  const [dismissedHref, setDismissedHref] = useState<string | null>(null);
  const [previousOpen, setPreviousOpen] = useState(detail.open);
  if (previousOpen !== detail.open) {
    setPreviousOpen(detail.open);
    setDismissedHref(null);
  }
  const current = `${detail.href}:${detail.page}:${detail.search}`;
  const query = new URLSearchParams(detail.href.split("?")[1]);
  return <>
    <Link ref={trigger} prefetch={false} scroll={false} className="inline-flex min-h-9 items-center rounded-md border border-white/10 px-3 text-sm text-zinc-200 hover:bg-white/5" href={detail.href} onClick={() => setDismissedHref(null)}><DetailLinkLabel count={itemCount} /></Link>
    <Dialog returnFocusRef={trigger} className={dialogClassName} description={description} title={title}
      open={detail.open && dismissedHref !== current}
      onClose={() => { setDismissedHref(current); router.push(detail.closeHref, { scroll: false }); }}>
      <div className="space-y-4">
        <Form action={detail.href.split("?")[0]} scroll={false} className="flex items-end gap-2">
          {[...query].map(([name,value],index) => <input key={`${name}-${index}`} type="hidden" name={name} value={value} />)}
          <label className="min-w-0 flex-1 space-y-1 text-sm">Search this list<input key={detail.search} defaultValue={detail.search} name="detailSearch" maxLength={160} className="block h-10 w-full rounded-md border border-white/15 bg-zinc-900 px-3" /></label>
          <Button type="submit" variant="secondary">Search</Button>
        </Form>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p aria-live="polite" className="text-zinc-400">{detail.total} {detail.total === 1 ? "result" : "results"} · Page {detail.page} of {detail.pageCount}</p>
          <nav aria-label="List pages" className="flex gap-4">
            {detail.page > 1 ? <Link prefetch={false} scroll={false} href={detail.previousHref}>Previous</Link> : <span className="text-zinc-600">Previous</span>}
            {detail.page < detail.pageCount ? <Link prefetch={false} scroll={false} href={detail.nextHref}>Next</Link> : <span className="text-zinc-600">Next</span>}
          </nav>
        </div>
        {detail.total ? children : <p className="text-sm text-zinc-400">No results match this search.</p>}
      </div>
    </Dialog>
  </>;
}
