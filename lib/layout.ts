import * as d3 from "d3";
import type { Definition, ERGraph, ERNode, ERLink } from "./types";

export function buildGraph(definitions: Definition[]): ERGraph {
  const nodes: ERNode[] = [];
  const links: ERLink[] = [];
  const nodeIds = new Set<string>();

  function addNode(node: ERNode) {
    if (!nodeIds.has(node.id)) {
      nodes.push(node);
      nodeIds.add(node.id);
    }
  }

  for (const def of definitions) {
    if (!("participants" in def)) {
      const nodeKind = def.kind;
      addNode({ id: `entity:${def.name}`, kind: nodeKind, label: def.name });
      for (const attr of def.attributes) {
        const attrId = `attr:${def.name}:${attr.name}`;
        addNode({ id: attrId, kind: "attribute", label: attr.name, attributeType: attr.type });
        links.push({ source: `entity:${def.name}`, target: attrId });
      }
    } else {
      const nodeKind = def.kind;
      const relId = `relation:${def.name}`;
      addNode({ id: relId, kind: nodeKind, label: def.name });
      for (const participant of def.participants) {
        const entityId = `entity:${participant.entityName}`;
        if (!nodeIds.has(entityId)) {
          addNode({ id: entityId, kind: "entity", label: participant.entityName });
        }
        links.push({
          source: relId,
          target: entityId,
          cardinality: participant.cardinality,
          cardinalityEnd: "target",
          participation: participant.participation,
        });
      }
      for (const attrName of def.attributes) {
        const attrId = `relattr:${def.name}:${attrName}`;
        addNode({ id: attrId, kind: "relation_attribute", label: attrName, attributeType: "regular" });
        links.push({ source: relId, target: attrId });
      }
    }
  }

  return { nodes, links };
}

// Bounding-circle radius matching actual rendered shape sizes + margin
function collisionRadius(n: ERNode): number {
  if (n.kind === "entity") return 76;          // rect 120×44, half-diag ≈ 64
  if (n.kind === "weak_entity") return 86;     // outer rect 132×56, half-diag ≈ 72
  if (n.kind === "relation") return 84;        // diamond 54, bounding circle ≈ 76
  if (n.kind === "weak_relation") return 98;   // outer diamond 62, bounding circle ≈ 88
  return 64;                                   // ellipse rx=52, dominant radius
}

const ATTR_DIST = 130; // distance from parent center to attribute center

export function runSimulation(graph: ERGraph): ERGraph {
  if (graph.nodes.length === 0) return graph;

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  // ── Build adjacency maps ─────────────────────────────────────────────
  const relToEntityIds = new Map<string, string[]>();
  const parentToAttrIds = new Map<string, string[]>();

  for (const link of graph.links) {
    const srcId = typeof link.source === "string" ? link.source : (link.source as ERNode).id;
    const tgtId = typeof link.target === "string" ? link.target : (link.target as ERNode).id;
    const src = nodeMap.get(srcId);
    const tgt = nodeMap.get(tgtId);
    if (!src || !tgt) continue;

    const srcIsRel = src.kind === "relation" || src.kind === "weak_relation";
    const tgtIsEntity = tgt.kind === "entity" || tgt.kind === "weak_entity";
    const tgtIsAttr = tgt.kind === "attribute" || tgt.kind === "relation_attribute";

    if (srcIsRel && tgtIsEntity) {
      if (!relToEntityIds.has(srcId)) relToEntityIds.set(srcId, []);
      relToEntityIds.get(srcId)!.push(tgtId);
    }
    if (tgtIsAttr) {
      if (!parentToAttrIds.has(srcId)) parentToAttrIds.set(srcId, []);
      parentToAttrIds.get(srcId)!.push(tgtId);
    }
  }

  const entityNodes = graph.nodes.filter(
    (n) => n.kind === "entity" || n.kind === "weak_entity"
  );
  const relationNodes = graph.nodes.filter(
    (n) => n.kind === "relation" || n.kind === "weak_relation"
  );

  // ── Phase 1a: entity ring ────────────────────────────────────────────
  // Ring radius must guarantee adjacent entities' attribute fans don't overlap.
  // Attribute fan reaches ATTR_DIST + collisionRadius(attr) from entity center.
  // Adjacent entity footprints need gap >= 2 * (ATTR_DIST + 64).
  // For N entities on ring radius R: adjacent distance = 2R * sin(π/N).
  const attrReach = ATTR_DIST + 64; // furthest point of an attribute from its entity center
  const N = Math.max(entityNodes.length, 1);
  const minSeparation = attrReach * 2 + 60; // 60px gap between fans
  const sinFactor = N === 1 ? 1 : Math.sin(Math.PI / N);
  const entityRingR = Math.max(280, Math.ceil(minSeparation / (2 * sinFactor)) + 40);

  entityNodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / N - Math.PI / 2;
    n.x = entityRingR * Math.cos(angle);
    n.y = entityRingR * Math.sin(angle);
  });

  // ── Phase 1b: relation placement ────────────────────────────────────
  // Put each relation at the centroid of its participants.
  // When multiple relations share the same participant pair, push them
  // apart perpendicularly to the line connecting those two entities.
  relationNodes.forEach((rel) => {
    const entityIds = relToEntityIds.get(rel.id) ?? [];
    let cx = 0, cy = 0, count = 0;
    for (const eid of entityIds) {
      const en = nodeMap.get(eid);
      if (en) { cx += en.x ?? 0; cy += en.y ?? 0; count++; }
    }
    rel.x = count > 0 ? cx / count : 0;
    rel.y = count > 0 ? cy / count : 0;
  });

  // Resolve collision between co-located relations.
  // For relations sharing the exact same entity pair, offset perpendicularly.
  for (let i = 0; i < relationNodes.length; i++) {
    for (let j = i + 1; j < relationNodes.length; j++) {
      const a = relationNodes[i], b = relationNodes[j];
      const dx = (b.x ?? 0) - (a.x ?? 0);
      const dy = (b.y ?? 0) - (a.y ?? 0);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 100) {
        // Find perpendicular direction from the pair's shared entity segment
        const aEntities = relToEntityIds.get(a.id) ?? [];
        let perpX = 0, perpY = 1;
        if (aEntities.length >= 2) {
          const e1 = nodeMap.get(aEntities[0]);
          const e2 = nodeMap.get(aEntities[1]);
          if (e1 && e2) {
            const ex = (e2.x ?? 0) - (e1.x ?? 0);
            const ey = (e2.y ?? 0) - (e1.y ?? 0);
            const elen = Math.sqrt(ex * ex + ey * ey) || 1;
            perpX = -ey / elen;
            perpY = ex / elen;
          }
        }
        const push = (100 - dist) / 2 + 20;
        a.x = (a.x ?? 0) - perpX * push;
        a.y = (a.y ?? 0) - perpY * push;
        b.x = (b.x ?? 0) + perpX * push;
        b.y = (b.y ?? 0) + perpY * push;
      }
    }
  }

  // ── Phase 1c: attribute fan placement ───────────────────────────────
  // Fan attributes outward, biased AWAY from all other structural nodes
  // (not just away from origin — this is what previously caused fans to
  // point toward adjacent entities).
  const structuralNodes = graph.nodes.filter(
    (n) => n.kind !== "attribute" && n.kind !== "relation_attribute"
  );

  function placeAttrsInFan(parentId: string, attrIds: string[]) {
    const parent = nodeMap.get(parentId);
    if (!parent || attrIds.length === 0) return;

    const px = parent.x ?? 0;
    const py = parent.y ?? 0;

    // Compute weighted "away" direction from all other structural nodes.
    // Weight inversely by distance so nearby nodes matter more.
    let awayX = 0, awayY = 0;
    for (const other of structuralNodes) {
      if (other.id === parentId) continue;
      const ox = other.x ?? 0;
      const oy = other.y ?? 0;
      const dx = px - ox;
      const dy = py - oy;
      const dist2 = dx * dx + dy * dy || 1;
      awayX += dx / dist2;
      awayY += dy / dist2;
    }

    // Normalise; fall back to "away from origin" if degenerate
    const awayLen = Math.sqrt(awayX * awayX + awayY * awayY);
    let baseAngle: number;
    if (awayLen > 1e-6) {
      baseAngle = Math.atan2(awayY / awayLen, awayX / awayLen);
    } else {
      baseAngle = Math.atan2(py, px);
    }

    // ~45° per attribute, max 180°
    const fanSpread = Math.min(Math.PI, attrIds.length * 0.78);

    attrIds.forEach((aid, i) => {
      const attrNode = nodeMap.get(aid);
      if (!attrNode) return;
      const t = attrIds.length === 1 ? 0.5 : i / (attrIds.length - 1);
      const angle = baseAngle + (t - 0.5) * fanSpread;
      attrNode.x = px + ATTR_DIST * Math.cos(angle);
      attrNode.y = py + ATTR_DIST * Math.sin(angle);
    });
  }

  parentToAttrIds.forEach((attrIds, parentId) => {
    placeAttrsInFan(parentId, attrIds);
  });

  // ── Phase 2: D3 force refinement ────────────────────────────────────
  // Pre-positioning is clean; force sim only needs minor adjustments.
  // Keep link strength low so collision wins over attraction.
  const resolvedLinks = graph.links
    .map((l) => ({
      ...l,
      source: typeof l.source === "string" ? nodeMap.get(l.source)! : (l.source as ERNode),
      target: typeof l.target === "string" ? nodeMap.get(l.target)! : (l.target as ERNode),
    }))
    .filter((l) => l.source && l.target);

  d3
    .forceSimulation<ERNode>(graph.nodes)
    .force(
      "link",
      d3
        .forceLink<ERNode, ERLink>(resolvedLinks as ERLink[])
        .id((d) => d.id)
        .distance((l) => {
          const s = l.source as ERNode;
          const t = l.target as ERNode;
          const isAttrEdge =
            s.kind === "attribute" || s.kind === "relation_attribute" ||
            t.kind === "attribute" || t.kind === "relation_attribute";
          return isAttrEdge ? ATTR_DIST : 170;
        })
        .strength(0.25) // weak — let collision take priority
    )
    .force("charge", d3.forceManyBody().strength(-1200))
    .force("center", d3.forceCenter(0, 0).strength(0.02))
    .force(
      "collision",
      d3.forceCollide<ERNode>().radius((n) => collisionRadius(n) + 6).strength(1)
    )
    .alphaMin(0.001)
    .stop()
    .tick(600);

  return { nodes: graph.nodes, links: graph.links };
}
