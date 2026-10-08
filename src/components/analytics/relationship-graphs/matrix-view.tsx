"use client";

import { useGraphSetting, graphMetric, graphText } from "./use-graph-setting";
import { ConnectionTable } from "./connection-table";
import { Popover } from "@/components/ui/popover";
import { hierarchy } from "d3-hierarchy";
import { scaleDiverging, scaleSequential } from "d3-scale";
import { interpolateRdBu, interpolateYlGnBu } from "d3-scale-chromatic";
import { useMemo, useRef } from "react";

import {
  GraphEmptyState,
  LabsControls,
} from "@/components/analytics/relationship-graphs/graphs-controls";
import { useNormalizedThreshold } from "@/components/analytics/relationship-graphs/use-normalized-threshold";
import {
  edgeWeight,
  LAB_DEFAULT_NORMALIZED,
  undirectedWeightScale,
  type RelationshipGraphData,
  type UndirectedMetric,
  type UndirectedRelationshipEdge,
} from "@/lib/relationship-graph-shared";

type ClusterLeaf = { name: string; id: string };
type ClusterBranch = { children: Array<ClusterLeaf | ClusterBranch> };

function similarityMap(
  edges: UndirectedRelationshipEdge[],
  metric: UndirectedMetric,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const edge of edges) {
    const weight = edgeWeight(edge, metric);
    if (weight == null) continue;
    map.set(`${edge.source}:${edge.target}`, weight);
    map.set(`${edge.target}:${edge.source}`, weight);
  }
  return map;
}

function pairSim(
  map: Map<string, number>,
  left: string,
  right: string,
): number | null {
  if (left === right) return null;
  return map.has(`${left}:${right}`) ? (map.get(`${left}:${right}`) ?? null) : null;
}

/** Average-linkage agglomerative clustering → d3 hierarchy leaf order. */
function clusteredOrder(
  ids: string[],
  sim: Map<string, number>,
): string[] {
  if (ids.length <= 1) return ids;

  type Item = { ids: string[]; tree: ClusterLeaf | ClusterBranch };
  const items: Item[] = ids.map((id) => ({
    ids: [id],
    tree: { id, name: id },
  }));

  while (items.length > 1) {
    let bestI = 0;
    let bestJ = 1;
    let bestScore = -Infinity;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        let total = 0;
        let count = 0;
        for (const left of items[i].ids) {
          for (const right of items[j].ids) {
            total += pairSim(sim, left, right) ?? 0;
            count += 1;
          }
        }
        const score = count ? total / count : 0;
        if (score > bestScore) {
          bestScore = score;
          bestI = i;
          bestJ = j;
        }
      }
    }
    const left = items[bestI];
    const right = items[bestJ];
    const merged: Item = {
      ids: [...left.ids, ...right.ids],
      tree: { children: [left.tree, right.tree] },
    };
    items.splice(bestJ, 1);
    items.splice(bestI, 1);
    items.push(merged);
  }

  const root = hierarchy(items[0].tree);
  return root.leaves().map((leaf) => (leaf.data as ClusterLeaf).id);
}

export function MatrixView({ graph }: { graph: RelationshipGraphData }) {
  const [metric, setMetric] = useGraphSetting<UndirectedMetric>("metric", "alignment", graphMetric);
  const [subset, setSubset] = useGraphSetting("matrixPlayers", "", graphText);
  const [pair, setPair] = useGraphSetting("pair", "", graphText);
  const grid = useRef<HTMLDivElement>(null);
  const scale = useMemo(() => undirectedWeightScale(graph.undirectedEdges, metric), [graph.undirectedEdges,metric]);
  const { normalized, rawThreshold, setNormalized } = useNormalizedThreshold(scale, `matrix:${graph.scopeKey}:${metric}`, LAB_DEFAULT_NORMALIZED.matrix);
  const { order, values } = useMemo(() => {
    const values = similarityMap(graph.undirectedEdges, metric);
    const ids = subset.split(",");
    const nodes = graph.nodes.filter(node => !subset || ids.includes(node.id));
    return {values, order:clusteredOrder(nodes.map(node=>node.id),values)};
  },[graph.nodes,graph.undirectedEdges,metric,subset]);
  const names = new Map(graph.nodes.map(node=>[node.id,node.name]));
  const [left,right] = pair.split(":");
  const selectedValue = left && right ? pairSim(values,left,right) : null;
  const color = metric === "alignment" ? scaleDiverging(interpolateRdBu).domain([-1,0,1]) : scaleSequential(interpolateYlGnBu).domain([0,1]);
  const label = (leftId:string,rightId:string) => {
    const value = pairSim(values,leftId,rightId);
    return `${names.get(leftId)} × ${names.get(rightId)}: ${leftId===rightId ? "same player" : value==null ? "no qualifying data" : `${(value*100).toFixed(1)}${metric==="alignment" ? " / 100 similarity" : "% mutual ballot share"}${value<rawThreshold ? " (below cutoff)" : ""}`}`;
  };
  if (!graph.nodes.length) return <GraphEmptyState message="No players to compare yet." />;
  const cell = Math.max(26,Math.min(40,Math.floor(850 / Math.max(1,order.length))));
  const selectedInGrid = order.includes(left) && order.includes(right);
  return <div className="space-y-4 min-w-0">
    <LabsControls metric={metric} onMetricChange={setMetric} onThresholdChange={setNormalized} rawThreshold={rawThreshold} threshold={normalized} thresholdLabel="Matrix connections">
      <Popover label="Players in matrix" trigger={<>Choose players ({order.length})</>}>
        <button type="button" className="mb-3 text-sm text-lime-300" onClick={()=>setSubset("")}>Show all players</button>
        {graph.nodes.map(node=><label key={node.id} className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" className="accent-lime-300" checked={order.includes(node.id)} onChange={()=>{const current=subset ? subset.split(",") : graph.nodes.map(node=>node.id);const next=current.includes(node.id) ? current.filter(id=>id!==node.id) : [...current,node.id];if(next.length)setSubset(next.join(","));}} />{node.name}</label>)}
      </Popover>
    </LabsControls>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-300" aria-label="Matrix color scale">
      {(metric === "alignment" ? [-1,0,1] : [0,0.5,1]).map(value=><span key={value} className="flex items-center gap-2"><i className="size-4 rounded-sm border border-white/20" style={{background:color(value)}} />{(value*100).toFixed(0)}{metric==="alignment" ? value<0 ? " opposing" : value>0 ? " agreement" : " neutral" : "%"}</span>)}
      <span className="flex items-center gap-2"><i className="grid size-4 place-items-center border border-white/20">—</i>No data</span><span>Faded: below cutoff</span>
    </div>
    <p role="status" aria-live="polite" className="min-h-12 rounded-md border border-white/10 px-4 py-3 text-sm text-zinc-200">{selectedInGrid ? label(left,right) : "Select a cell, or use Tab and the arrow keys to compare players."}{selectedInGrid && selectedValue!=null ? ` · ${graph.undirectedEdges.find(edge=>(edge.source===left && edge.target===right)||(edge.target===left && edge.source===right))?.sharedRounds ?? 0} shared rounds` : ""}</p>
    <div ref={grid} role="group" aria-label="Player comparison matrix" className="overflow-auto rounded-lg border border-white/10 bg-zinc-950 p-3">
      <div className="inline-grid gap-px" style={{gridTemplateColumns:`120px repeat(${order.length}, ${cell}px)`}}>
        <span />{order.map(id=><span key={id} className="truncate py-1 text-xs text-zinc-400" style={{writingMode:"vertical-rl",transform:"rotate(180deg)",height:120}} title={names.get(id)}>{names.get(id)}</span>)}
        {order.map((rowId,row)=><div key={rowId} className="contents"><span className="truncate pr-2 text-right text-xs text-zinc-400" style={{lineHeight:`${cell}px`}}>{names.get(rowId)}</span>
          {order.map((colId,col)=>{const value=pairSim(values,rowId,colId);const diagonal=rowId===colId;const active=left===rowId && right===colId;return <button key={colId} type="button" data-row={row} data-col={col} aria-label={label(rowId,colId)} aria-pressed={active} tabIndex={selectedInGrid ? active ? 0 : -1 : row===0 && col===Math.min(1,order.length-1) ? 0 : -1} onFocus={()=>setPair(`${rowId}:${colId}`)} onClick={()=>setPair(`${rowId}:${colId}`)} onKeyDown={event=>{
            const moves:Record<string,[number,number]>={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};const move=moves[event.key];if(!move)return;event.preventDefault();const nextRow=Math.max(0,Math.min(order.length-1,row+move[0]));const nextCol=Math.max(0,Math.min(order.length-1,col+move[1]));grid.current?.querySelector<HTMLElement>(`[data-row="${nextRow}"][data-col="${nextCol}"]`)?.focus();
          }} className="rounded-sm text-xs text-zinc-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lime-300" style={{width:cell,height:cell,background:diagonal ? "#27272a" : value==null ? "transparent" : color(value),opacity:value!=null && value<rawThreshold ? 0.2 : 1,outline:active ? "2px solid #bef264" : undefined}}>{value==null ? "—" : ""}</button>;})}
        </div>)}
      </div>
    </div>
    <ConnectionTable unit={metric==="alignment" ? "Similarity / 100" : "Mutual share (%)"} onSelect={setPair} rows={graph.undirectedEdges.filter(edge=>order.includes(edge.source)&&order.includes(edge.target)).map(edge=>({id:`${edge.source}:${edge.target}`,left:edge.sourceName,right:edge.targetName,value:edgeWeight(edge,metric)==null ? null : edgeWeight(edge,metric)!*100,context:`${edge.sharedRounds ?? 0} shared rounds${edgeWeight(edge,metric)!=null && edgeWeight(edge,metric)!<rawThreshold ? " · below cutoff" : ""}`}))} />
  </div>;
}
