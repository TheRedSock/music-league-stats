"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function GraphViewSelect({value,views}: {value:string;views:Array<{id:string;label:string;href:string}>}) {
  const router=useRouter(),params=useSearchParams();
  function href(view:{href:string}) {
    const metric=params.get("metric");
    if(!metric || !["alignment","mutual","mutual-share"].includes(metric))return view.href;
    const url=new URL(view.href,"http://local.invalid");url.searchParams.set("metric",metric);
    return `${url.pathname}${url.search}`;
  }
  return <>
    <label className="mt-4 block text-xs text-zinc-400 md:hidden"><span className="sr-only">Graph view</span><select aria-label="Graph view" className="h-11 w-full rounded-md border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-100" value={value} onChange={event=>{const next=views.find(view=>view.id===event.target.value);if(next)router.push(href(next));}}>{views.map(view=><option key={view.id} value={view.id}>{view.label}</option>)}</select></label>
    <nav aria-label="Graph views" className="mt-5 hidden flex-wrap gap-2 md:flex">{views.map(view=><Link key={view.id} className={cn(buttonStyles({size:"sm",variant:"ghost"}),value===view.id ? "border border-lime-300/30 bg-lime-300/10 text-lime-100" : "border border-white/10 text-zinc-400")} href={href(view)}>{view.label}</Link>)}</nav>
  </>;
}
