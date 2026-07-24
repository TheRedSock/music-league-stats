"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

export type ForceNode = {
  id: string;
  name: string;
  color?: string;
  val?: number;
  fx?: number;
  fy?: number;
};

export type ForceLink = {
  source: string;
  target: string;
  weight: number;
  color?: string;
  curvature?: number;
  label?: string;
};

export type ForceGraphLayout = {
  chargeStrength?: number;
  collideRadius?: number;
  height?: number;
  labelMinPx?: number;
  linkDistance?: number;
  linkOpacityMax?: number;
  linkOpacityMin?: number;
  nodeBaseRadius?: number;
  /** Darker lime-ish links when no per-link color is set. */
  useDarkLinks?: boolean;
};

export function RelationshipForceGraph({
  directed = false,
  highlightId = null,
  layout = {},
  links,
  nodes,
}: {
  directed?: boolean;
  highlightId?: string | null;
  layout?: ForceGraphLayout;
  links: ForceLink[];
  nodes: ForceNode[];
}) {
  const {
    chargeStrength = -180,
    collideRadius = 18,
    height = 560,
    labelMinPx = 11,
    linkDistance = 90,
    linkOpacityMax = 0.95,
    linkOpacityMin = 0.55,
    nodeBaseRadius = 6,
    useDarkLinks = true,
  } = layout;

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [width, setWidth] = useState(640);
  const graphData = useMemo(() => ({ links, nodes }), [links, nodes]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.max(320, Math.floor(entry.contentRect.width)));
    });
    observer.observe(el);
    setWidth(Math.max(320, Math.floor(el.clientWidth)));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;

    void import("d3-force").then((d3Force) => {
      const linkForce = graph.d3Force("link");
      if (linkForce?.distance) linkForce.distance(linkDistance);

      graph.d3Force(
        "charge",
        d3Force.forceManyBody().strength(chargeStrength).distanceMax(420),
      );
      graph.d3Force(
        "collide",
        d3Force
          .forceCollide()
          .radius((node) => {
            const val = (node as { val?: number }).val ?? 1;
            return collideRadius * val;
          })
          .strength(0.85),
      );
      graph.d3Force("center", d3Force.forceCenter(0, 0).strength(0.12));
      graph.d3ReheatSimulation?.();
    });
  }, [chargeStrength, collideRadius, linkDistance, links, nodes]);

  const maxWeight = Math.max(...links.map((link) => link.weight), 0.0001);

  function nodeRadius(node: ForceNode): number {
    const isFocus = highlightId != null && node.id === highlightId;
    return nodeBaseRadius * (node.val ?? 1) * (isFocus ? 1.25 : 1);
  }

  return (
    <div
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/60"
      ref={containerRef}
      style={{ height }}
    >
      <ForceGraph2D
        backgroundColor="rgba(0,0,0,0)"
        graphData={graphData}
        height={height}
        linkColor={(link) => {
          const typed = link as ForceLink;
          if (typed.color) return typed.color;
          const t = typed.weight / maxWeight;
          const opacity = linkOpacityMin + t * (linkOpacityMax - linkOpacityMin);
          // Darker olive/lime so white labels stay readable.
          return useDarkLinks
            ? `rgba(101, 163, 13, ${opacity})`
            : `rgba(190, 242, 100, ${opacity})`;
        }}
        linkCurvature="curvature"
        linkDirectionalArrowLength={directed ? 6 : 0}
        linkDirectionalArrowRelPos={1}
        linkWidth={(link) => {
          const typed = link as ForceLink;
          return 1 + (typed.weight / maxWeight) * 4;
        }}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const typed = node as ForceNode & { x?: number; y?: number };
          const x = typed.x ?? 0;
          const y = typed.y ?? 0;
          const isFocus = highlightId != null && typed.id === highlightId;
          const radius = nodeRadius(typed);
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
          ctx.fillStyle = typed.color ?? (isFocus ? "#fde68a" : "#e4e4e7");
          ctx.fill();
          if (isFocus) {
            ctx.strokeStyle = "rgba(253, 230, 138, 0.85)";
            ctx.lineWidth = 2 / globalScale;
            ctx.stroke();
          }
          const fontSize = Math.max(labelMinPx / globalScale, 3.2);
          ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.lineWidth = 3 / globalScale;
          ctx.strokeStyle = "rgba(9, 9, 11, 0.75)";
          ctx.strokeText(typed.name, x, y + radius + 2);
          ctx.fillStyle = "rgba(250, 250, 250, 0.96)";
          ctx.fillText(typed.name, x, y + radius + 2);
        }}
        // Custom canvas nodes ignore default sqrt(val)*nodeRelSize hitboxes —
        // paint a matching (slightly padded) circle for drag/hover.
        nodePointerAreaPaint={(node, color, ctx) => {
          const typed = node as ForceNode & { x?: number; y?: number };
          const radius = nodeRadius(typed) + 3;
          ctx.beginPath();
          ctx.arc(typed.x ?? 0, typed.y ?? 0, radius, 0, 2 * Math.PI, false);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        nodeLabel={(node) => (node as ForceNode).name}
        ref={graphRef}
        width={width}
      />
    </div>
  );
}
