"use client";

import React, { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";
import type { ERGraph, ERNode, ERLink } from "@/lib/types";

interface ChenCanvasProps {
  graph: ERGraph | null;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onZoomReady?: (zoom: d3.ZoomBehavior<SVGSVGElement, unknown>) => void;
}

const ENTITY_W = 120;
const ENTITY_H = 44;
const WEAK_ENTITY_OFFSET = 6;   // px outset for double rect
const DIAMOND_SIZE = 54;
const WEAK_DIAMOND_OFFSET = 8;  // px outset for double diamond
const ELLIPSE_RX = 52;
const ELLIPSE_RY = 22;
const ELLIPSE_INNER_OFFSET = 5;
const SPEC_CIRCLE_R = 14;       // radius of the spec/gen circle node

type ResolvedLink = ERLink & { source: ERNode; target: ERNode };
type ExpandedLink = ResolvedLink & { offsetSign: number };

function perpOffset(l: ExpandedLink): { px: number; py: number } {
  if (l.offsetSign === 0) return { px: 0, py: 0 };
  const dx = (l.target.x ?? 0) - (l.source.x ?? 0);
  const dy = (l.target.y ?? 0) - (l.source.y ?? 0);
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return {
    px: (-dy / len) * 3 * l.offsetSign,
    py: (dx / len) * 3 * l.offsetSign,
  };
}

export default function ChenCanvas({ graph, svgRef, onZoomReady }: ChenCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  // Setup zoom
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        if (gRef.current) {
          d3.select(gRef.current).attr("transform", event.transform.toString());
        }
      });

    svg.call(zoom);
    zoomRef.current = zoom;
    onZoomReady?.(zoom);

    return () => {
      svg.on(".zoom", null);
    };
  }, [svgRef, onZoomReady]);

  const renderGraph = useCallback(() => {
    if (!svgRef.current || !gRef.current || !graph) return;

    const g = d3.select(gRef.current);
    g.selectAll("*").remove();

    if (graph.nodes.length === 0) return;

    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

    // Resolve link endpoints
    const resolvedLinks: ResolvedLink[] = graph.links
      .map((l) => ({
        ...l,
        source:
          typeof l.source === "string"
            ? (nodeMap.get(l.source) ?? null)
            : (l.source as ERNode),
        target:
          typeof l.target === "string"
            ? (nodeMap.get(l.target) ?? null)
            : (l.target as ERNode),
      }))
      .filter(
        (l): l is ResolvedLink => l.source != null && l.target != null
      );

    // Split: inheritance links (circle→subclass with arrowhead) vs regular links
    const inheritLinks = resolvedLinks.filter((l) => l.isInheritance);
    const regularLinks = resolvedLinks.filter((l) => !l.isInheritance);

    // Expand total-participation regular links into two parallel lines (offsetSign ±1)
    const expandedLinks: ExpandedLink[] = regularLinks.flatMap((l) =>
      l.participation === "total"
        ? [
            { ...l, offsetSign: 1 },
            { ...l, offsetSign: -1 },
          ]
        : [{ ...l, offsetSign: 0 }]
    );

    // Draw links first (behind nodes)
    const linkGroup = g.append("g").attr("class", "links");

    // ── Regular edges ─────────────────────────────────────────────────
    linkGroup
      .selectAll<SVGLineElement, ExpandedLink>("line.edge")
      .data(expandedLinks)
      .enter()
      .append("line")
      .attr("class", "edge")
      .attr("x1", (d) => (d.source.x ?? 0) + perpOffset(d).px)
      .attr("y1", (d) => (d.source.y ?? 0) + perpOffset(d).py)
      .attr("x2", (d) => (d.target.x ?? 0) + perpOffset(d).px)
      .attr("y2", (d) => (d.target.y ?? 0) + perpOffset(d).py)
      .style("stroke", "hsl(var(--foreground))")
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.7);

    // ── Inheritance edges (drawn from subclass→circle so marker-end faces circle) ──
    linkGroup
      .selectAll<SVGLineElement, ResolvedLink>("line.inherit-edge")
      .data(inheritLinks)
      .enter()
      .append("line")
      .attr("class", "inherit-edge")
      // Draw from target (subclass) → source (circle); arrowhead points toward circle
      .attr("x1", (d) => d.target.x ?? 0)
      .attr("y1", (d) => d.target.y ?? 0)
      .attr("x2", (d) => d.source.x ?? 0)
      .attr("y2", (d) => d.source.y ?? 0)
      .style("stroke", "hsl(var(--foreground))")
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.7)
      .attr("marker-end", "url(#arrow-inherit)");

    // Cardinality labels — placed just outside the entity node boundary,
    // along the line from the relation center to the entity center.
    function cardLabelPos(d: ResolvedLink): { x: number; y: number } {
      const tx = d.target.x ?? 0; // entity center
      const ty = d.target.y ?? 0;
      const sx = d.source.x ?? 0; // relation center
      const sy = d.source.y ?? 0;
      const dx = sx - tx;
      const dy = sy - ty;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;

      let edgeDist = 50; // fallback
      const tk = d.target.kind;
      if (tk === "entity") {
        const hw = ENTITY_W / 2;
        const hh = ENTITY_H / 2;
        const tx2 = ux !== 0 ? hw / Math.abs(ux) : Infinity;
        const ty2 = uy !== 0 ? hh / Math.abs(uy) : Infinity;
        edgeDist = Math.min(tx2, ty2);
      } else if (tk === "weak_entity") {
        const hw = ENTITY_W / 2 + WEAK_ENTITY_OFFSET;
        const hh = ENTITY_H / 2 + WEAK_ENTITY_OFFSET;
        const tx2 = ux !== 0 ? hw / Math.abs(ux) : Infinity;
        const ty2 = uy !== 0 ? hh / Math.abs(uy) : Infinity;
        edgeDist = Math.min(tx2, ty2);
      }

      const LABEL_GAP = 14;
      const PERP = 13;
      return {
        x: tx + (edgeDist + LABEL_GAP) * ux + (-uy) * PERP,
        y: ty + (edgeDist + LABEL_GAP) * uy + ux * PERP,
      };
    }

    linkGroup
      .selectAll<SVGTextElement, ResolvedLink>("text.card-label")
      .data(regularLinks.filter((l) => l.cardinality))
      .enter()
      .append("text")
      .attr("class", "card-label")
      .style("fill", "hsl(var(--foreground))")
      .attr("font-size", 13)
      .attr("font-weight", "bold")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("x", (d) => cardLabelPos(d).x)
      .attr("y", (d) => cardLabelPos(d).y)
      .text((d) => d.cardinality ?? "");

    // Draw nodes
    const nodeGroup = g.append("g").attr("class", "nodes");

    const nodesSel = nodeGroup
      .selectAll<SVGGElement, ERNode>("g.node")
      .data(graph.nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
      .style("cursor", "grab");

    // ── Regular Entity → single rect ──────────────────────────────────
    const entities = nodesSel.filter((d) => d.kind === "entity");
    entities
      .append("rect")
      .attr("x", -ENTITY_W / 2)
      .attr("y", -ENTITY_H / 2)
      .attr("width", ENTITY_W)
      .attr("height", ENTITY_H)
      .style("fill", "hsl(var(--card))")
      .style("stroke", "hsl(var(--foreground))")
      .attr("stroke-width", 2)
      .attr("rx", 2);
    entities
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-weight", "bold")
      .attr("font-size", 14)
      .style("fill", "hsl(var(--foreground))")
      .text((d) => d.label);

    // ── Weak Entity → two concentric rects ───────────────────────────
    const weakEntities = nodesSel.filter((d) => d.kind === "weak_entity");
    weakEntities
      .append("rect")
      .attr("x", -(ENTITY_W / 2 + WEAK_ENTITY_OFFSET))
      .attr("y", -(ENTITY_H / 2 + WEAK_ENTITY_OFFSET))
      .attr("width", ENTITY_W + WEAK_ENTITY_OFFSET * 2)
      .attr("height", ENTITY_H + WEAK_ENTITY_OFFSET * 2)
      .style("fill", "hsl(var(--card))")
      .style("stroke", "hsl(var(--foreground))")
      .attr("stroke-width", 2)
      .attr("rx", 2);
    weakEntities
      .append("rect")
      .attr("x", -ENTITY_W / 2)
      .attr("y", -ENTITY_H / 2)
      .attr("width", ENTITY_W)
      .attr("height", ENTITY_H)
      .style("fill", "none")
      .style("stroke", "hsl(var(--foreground))")
      .attr("stroke-width", 2)
      .attr("rx", 2);
    weakEntities
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-weight", "bold")
      .attr("font-size", 14)
      .style("fill", "hsl(var(--foreground))")
      .text((d) => d.label);

    // ── Regular Relation → single diamond ────────────────────────────
    const relations = nodesSel.filter((d) => d.kind === "relation");
    const ds = DIAMOND_SIZE;
    relations
      .append("polygon")
      .attr("points", `0,${-ds} ${ds},0 0,${ds} ${-ds},0`)
      .style("fill", "hsl(var(--card))")
      .style("stroke", "hsl(var(--foreground))")
      .attr("stroke-width", 2);
    relations
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 12)
      .style("fill", "hsl(var(--foreground))")
      .text((d) => d.label);

    // ── Weak Relation → two concentric diamonds ───────────────────────
    const weakRelations = nodesSel.filter((d) => d.kind === "weak_relation");
    const wds = DIAMOND_SIZE + WEAK_DIAMOND_OFFSET;
    weakRelations
      .append("polygon")
      .attr("points", `0,${-wds} ${wds},0 0,${wds} ${-wds},0`)
      .style("fill", "hsl(var(--card))")
      .style("stroke", "hsl(var(--foreground))")
      .attr("stroke-width", 2);
    weakRelations
      .append("polygon")
      .attr("points", `0,${-ds} ${ds},0 0,${ds} ${-ds},0`)
      .style("fill", "none")
      .style("stroke", "hsl(var(--foreground))")
      .attr("stroke-width", 2);
    weakRelations
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 12)
      .style("fill", "hsl(var(--foreground))")
      .text((d) => d.label);

    // ── Spec/Gen circle → small circle with "d" or "o" label ─────────
    const specCircles = nodesSel.filter((d) => d.kind === "spec_circle");
    specCircles
      .append("circle")
      .attr("r", SPEC_CIRCLE_R)
      .style("fill", "hsl(var(--background))")
      .style("stroke", "hsl(var(--foreground))")
      .attr("stroke-width", 2);
    specCircles
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 13)
      .attr("font-weight", "bold")
      .style("fill", "hsl(var(--foreground))")
      .text((d) => d.label);

    // ── Attribute ellipses ────────────────────────────────────────────
    const attrs = nodesSel.filter(
      (d) => d.kind === "attribute" || d.kind === "relation_attribute"
    );

    attrs
      .append("ellipse")
      .attr("rx", ELLIPSE_RX)
      .attr("ry", ELLIPSE_RY)
      .style("fill", "hsl(var(--card))")
      .style("stroke", "hsl(var(--foreground))")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", (d) =>
        d.attributeType === "derived" ? "5,3" : "none"
      );

    attrs
      .filter((d) => d.attributeType === "multi_valued")
      .append("ellipse")
      .attr("rx", ELLIPSE_RX - ELLIPSE_INNER_OFFSET)
      .attr("ry", ELLIPSE_RY - ELLIPSE_INNER_OFFSET)
      .style("fill", "none")
      .style("stroke", "hsl(var(--foreground))")
      .attr("stroke-width", 1.5);

    attrs
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 12)
      .style("fill", "hsl(var(--foreground))")
      .attr("text-decoration", (d) =>
        d.attributeType === "primary_key" ? "underline" : "none"
      )
      .text((d) => d.label);

    // Dashed underline for partial_key
    attrs
      .filter((d) => d.attributeType === "partial_key")
      .append("line")
      .attr("class", "partial-key-underline")
      .attr("x1", (d) => -(d.label.length * 3.4))
      .attr("y1", 9)
      .attr("x2", (d) => d.label.length * 3.4)
      .attr("y2", 9)
      .style("stroke", "hsl(var(--foreground))")
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "3,2");

    // ── D3 drag ───────────────────────────────────────────────────────
    const drag = d3
      .drag<SVGGElement, ERNode>()
      .on("start", function () {
        d3.select(this).style("cursor", "grabbing");
      })
      .on("drag", function (event, d) {
        d.x = event.x;
        d.y = event.y;
        d3.select(this).attr("transform", `translate(${event.x},${event.y})`);

        // Update regular edge lines
        linkGroup
          .selectAll<SVGLineElement, ExpandedLink>("line.edge")
          .attr("x1", (l) => (l.source.x ?? 0) + perpOffset(l).px)
          .attr("y1", (l) => (l.source.y ?? 0) + perpOffset(l).py)
          .attr("x2", (l) => (l.target.x ?? 0) + perpOffset(l).px)
          .attr("y2", (l) => (l.target.y ?? 0) + perpOffset(l).py);

        // Update inheritance edges (drawn reversed: target=subclass → source=circle)
        linkGroup
          .selectAll<SVGLineElement, ResolvedLink>("line.inherit-edge")
          .attr("x1", (l) => l.target.x ?? 0)
          .attr("y1", (l) => l.target.y ?? 0)
          .attr("x2", (l) => l.source.x ?? 0)
          .attr("y2", (l) => l.source.y ?? 0);

        // Update cardinality labels
        linkGroup
          .selectAll<SVGTextElement, ResolvedLink>("text.card-label")
          .attr("x", (l) => cardLabelPos(l).x)
          .attr("y", (l) => cardLabelPos(l).y);
      })
      .on("end", function () {
        d3.select(this).style("cursor", "grab");
      });

    nodesSel.call(drag);

    // Auto-fit view after render
    const svgEl = svgRef.current;
    if (svgEl && zoomRef.current) {
      const container = svgEl.getBoundingClientRect();
      const gEl = gRef.current;
      if (gEl) {
        requestAnimationFrame(() => {
          const bounds = gEl.getBBox();
          if (bounds.width === 0 || bounds.height === 0) return;
          const padding = 60;
          const scaleX = (container.width - padding * 2) / bounds.width;
          const scaleY = (container.height - padding * 2) / bounds.height;
          const scale = Math.min(scaleX, scaleY, 1.5);
          const tx =
            container.width / 2 - scale * (bounds.x + bounds.width / 2);
          const ty =
            container.height / 2 - scale * (bounds.y + bounds.height / 2);

          d3.select(svgEl)
            .transition()
            .duration(400)
            .call(
              zoomRef.current!.transform,
              d3.zoomIdentity.translate(tx, ty).scale(scale)
            );
        });
      }
    }
  }, [graph, svgRef]);

  useEffect(() => {
    renderGraph();
  }, [renderGraph]);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <svg
        ref={svgRef as React.RefObject<SVGSVGElement>}
        className="w-full h-full"
        style={{ background: "transparent" }}
      >
        <defs>
          <pattern
            id="grid"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx="1"
              cy="1"
              r="1"
              style={{ fill: "hsl(var(--border))", opacity: 0.6 }}
            />
          </pattern>
          {/* Arrowhead for specialization/generalization inheritance lines.
              Points toward the spec circle (inheritance direction indicator).
              Line is drawn subclass→circle so marker-end lands at circle. */}
          <marker
            id="arrow-inherit"
            markerWidth="10"
            markerHeight="8"
            refX="9"
            refY="4"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <polygon
              points="0 0, 10 4, 0 8"
              style={{ fill: "hsl(var(--foreground))" }}
            />
          </marker>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <g ref={gRef} data-export-root="true" />
      </svg>

      {/* Empty state */}
      {(!graph || graph.nodes.length === 0) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
          <svg
            width="80"
            height="80"
            viewBox="0 0 80 80"
            className="text-muted-foreground/30 mb-4"
            fill="none"
          >
            <rect x="8" y="8" width="64" height="28" rx="2" stroke="currentColor" strokeWidth="2" />
            <ellipse cx="40" cy="62" rx="22" ry="11" stroke="currentColor" strokeWidth="2" />
            <polygon points="40,38 56,50 40,62 24,50" stroke="currentColor" strokeWidth="2" />
            <line x1="40" y1="36" x2="40" y2="40" stroke="currentColor" strokeWidth="2" />
          </svg>
          <p className="text-muted-foreground/50 text-sm font-medium">
            Enter DSL and click Render
          </p>
        </div>
      )}
    </div>
  );
}
