"use client";
import { useRouter } from "next/navigation";
export function GraphViewSelect({ value, views }: {value:string; views:Array<{id:string;label:string;href:string}>}) {
  const router=useRouter();
  return <label className="mt-4 block text-xs text-zinc-400 md:hidden"><span className="sr-only">Graph view</span><select aria-label="Graph view" className="h-11 w-full rounded-md border border-white/10 bg-zinc-900 px-3 text-sm text-zinc-100" value={value} onChange={event=>{const next=views.find(view=>view.id===event.target.value);if(next)router.push(next.href);}}>{views.map(view=><option key={view.id} value={view.id}>{view.label}</option>)}</select></label>;
}
