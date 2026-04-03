import * as d3 from "d3";
import type { Definition, ERGraph, ERNode, ERLink, SpecGenDef } from "./types";

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

  // Counter so multiple SPECIALIZATION blocks on the same superclass get unique IDs
  const specCircleCounters = new Map<string, number>();

  for (const def of definitions) {
    if (def.kind === "entity" || def.kind === "weak_entity") {
      addNode({ id: `entity:${def.name}`, kind: def.kind, label: def.name });
      for (const attr of def.attributes) {
        const attrId = `attr:${def.name}:${attr.name}`;
        addNode({ id: attrId, kind: "attribute", label: attr.name, attributeType: attr.type });
        links.push({ source: `entity:${def.name}`, target: attrId });
      }
    } else if (def.kind === "relation" || def.kind === "weak_relation") {
      const relId = `relation:${def.name}`;
      addNode({ id: relId, kind: def.kind, label: def.name });
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
    } else {
      // specialization | generalization
      const sdef = def as SpecGenDef;
      const idx = specCircleCounters.get(sdef.superclass) ?? 0;
      specCircleCounters.set(sdef.superclass, idx + 1);

      const circleId = `spec:${sdef.superclass}:${idx}`;
      const circleLabel = sdef.constraint === "disjoint" ? "d" : "o";
      addNode({ id: circleId, kind: "spec_circle", label: circleLabel });

      // Ensure superclass entity node exists
      const superclassId = `entity:${sdef.superclass}`;
      if (!nodeIds.has(superclassId)) {
        addNode({ id: superclassId, kind: "entity", label: sdef.superclass });
      }

      // Superclass → circle (participation controls single/double line)
      links.push({
        source: superclassId,
        target: circleId,
        participation: sdef.participation,
      });

      // Circle → each subclass (isInheritance = true → arrowhead drawn)
      for (const sub of sdef.subclasses) {
        const subId = `entity:${sub}`;
        if (!nodeIds.has(subId)) {
          addNode({ id: subId, kind: "entity", label: sub });
        }
        links.push({ source: circleId, target: subId, isInheritance: true });
      }
    }
  }

  return { nodes, links };
}

// Bounding-circle radius matching actual rendered shape sizes + margin
function collisionRadius(n: ERNode): number {
  if (n.kind === "entity") return 76;
  if (n.kind === "weak_entity") return 86;
  if (n.kind === "relation") return 84;
  if (n.kind === "weak_relation") return 98;
  if (n.kind === "spec_circle") return 32;
  return 64; // attribute ellipse
}

const ATTR_DIST = 100;

export function runSimulation(graph: ERGraph): ERGraph {
  if (graph.nodes.length === 0) return graph;

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  // ── Build adjacency maps ─────────────────────────────────────────────
  const relToEntityIds = new Map<string, string[]>();
  const parentToAttrIds = new Map<string, string[]>();
  const circleToSuperclassId = new Map<string, string>();
  const circleToSubclassIds = new Map<string, string[]>();

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

    // Spec circle adjacency
    if (tgt.kind === "spec_circle" && (tgtIsEntity || src.kind === "entity" || src.kind === "weak_entity")) {
      circleToSuperclassId.set(tgtId, srcId);
    }
    if (src.kind === "spec_circle" && link.isInheritance) {
      if (!circleToSubclassIds.has(srcId)) circleToSubclassIds.set(srcId, []);
      circleToSubclassIds.get(srcId)!.push(tgtId);
    }
  }

  // Identify which entity nodes are exclusively subclasses (not superclasses, no explicit relations)
  // These should NOT go on the entity ring — their placement comes from spec layout.
  const subclassOnlyIds = new Set<string>();
  circleToSubclassIds.forEach((subIds) => {
    for (const subId of subIds) {
      subclassOnlyIds.add(subId);
    }
  });
  // Remove from subclassOnlyIds anything that is ALSO a superclass
  circleToSuperclassId.forEach((superclassId) => {
    subclassOnlyIds.delete(superclassId);
  });
  // Remove anything that participates in a relation (has explicit connections beyond spec)
  relToEntityIds.forEach((entityIds) => {
    for (const eid of entityIds) {
      subclassOnlyIds.delete(eid);
    }
  });

  const entityNodes = graph.nodes.filter(
    (n) =>
      (n.kind === "entity" || n.kind === "weak_entity") &&
      !subclassOnlyIds.has(n.id)
  );
  const relationNodes = graph.nodes.filter(
    (n) => n.kind === "relation" || n.kind === "weak_relation"
  );
  const specCircleNodes = graph.nodes.filter((n) => n.kind === "spec_circle");

  // ── Phase 1a: entity ring ────────────────────────────────────────────
  const attrReach = ATTR_DIST + 60;
  const N = Math.max(entityNodes.length, 1);
  const minSeparation = attrReach * 2 + 20;
  const sinFactor = N === 1 ? 1 : Math.sin(Math.PI / N);
  const entityRingR = Math.max(200, Math.ceil(minSeparation / (2 * sinFactor)) + 20);

  entityNodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / N - Math.PI / 2;
    n.x = entityRingR * Math.cos(angle);
    n.y = entityRingR * Math.sin(angle);
  });

  // ── Phase 1b: relation placement ────────────────────────────────────
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

  // Resolve collision between co-located relations
  for (let i = 0; i < relationNodes.length; i++) {
    for (let j = i + 1; j < relationNodes.length; j++) {
      const a = relationNodes[i], b = relationNodes[j];
      const dx = (b.x ?? 0) - (a.x ?? 0);
      const dy = (b.y ?? 0) - (a.y ?? 0);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 100) {
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
  const structuralNodes = graph.nodes.filter(
    (n) => n.kind !== "attribute" && n.kind !== "relation_attribute"
  );

  function placeAttrsInFan(parentId: string, attrIds: string[]) {
    const parent = nodeMap.get(parentId);
    if (!parent || attrIds.length === 0) return;

    const px = parent.x ?? 0;
    const py = parent.y ?? 0;

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

    const awayLen = Math.sqrt(awayX * awayX + awayY * awayY);
    let baseAngle: number;
    if (awayLen > 1e-6) {
      baseAngle = Math.atan2(awayY / awayLen, awayX / awayLen);
    } else {
      baseAngle = Math.atan2(py, px);
    }

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

  // ── Phase 1d: spec circle and subclass placement ─────────────────────
  // Group spec circles by superclass to spread multiple circles
  const superclassToCircleIds = new Map<string, string[]>();
  specCircleNodes.forEach((circle) => {
    const superclassId = circleToSuperclassId.get(circle.id);
    if (!superclassId) return;
    if (!superclassToCircleIds.has(superclassId)) superclassToCircleIds.set(superclassId, []);
    superclassToCircleIds.get(superclassId)!.push(circle.id);
  });

  const CIRCLE_DIST = 120; // px from superclass center to spec circle center
  const SUBCLASS_DIST = 130; // px from spec circle center to subclass center
  const CIRCLE_SPREAD = 100; // px perpendicular spacing between multiple circles

  superclassToCircleIds.forEach((circleIds, superclassId) => {
    const superclass = nodeMap.get(superclassId);
    if (!superclass) return;

    const sx = superclass.x ?? 0;
    const sy = superclass.y ?? 0;

    // Outward angle: from origin through superclass position
    // (away from the center of the entity ring)
    const outAngle = Math.atan2(sy, sx);
    const perpAngle = outAngle + Math.PI / 2;
    const numCircles = circleIds.length;

    circleIds.forEach((circleId, idx) => {
      const circle = nodeMap.get(circleId);
      if (!circle) return;

      // Spread multiple circles perpendicularly; center for single circle
      const perpOffset = numCircles === 1 ? 0 : (idx - (numCircles - 1) / 2) * CIRCLE_SPREAD;
      circle.x = sx + CIRCLE_DIST * Math.cos(outAngle) + perpOffset * Math.cos(perpAngle);
      circle.y = sy + CIRCLE_DIST * Math.sin(outAngle) + perpOffset * Math.sin(perpAngle);

      // Fan subclasses outward from the circle in the same outward direction
      const subIds = circleToSubclassIds.get(circleId) ?? [];
      const numSubs = subIds.length;
      const fanSpread = Math.min(Math.PI * 0.85, numSubs * 0.55);

      subIds.forEach((subId, si) => {
        const sub = nodeMap.get(subId);
        if (!sub) return;
        const t = numSubs === 1 ? 0.5 : si / (numSubs - 1);
        const subAngle = outAngle + (t - 0.5) * fanSpread;
        sub.x = (circle.x ?? 0) + SUBCLASS_DIST * Math.cos(subAngle);
        sub.y = (circle.y ?? 0) + SUBCLASS_DIST * Math.sin(subAngle);
      });
    });
  });

  // ── Phase 2: D3 force refinement ────────────────────────────────────
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
          if (s.kind === "spec_circle" || t.kind === "spec_circle") return 110;
          const isAttrEdge =
            s.kind === "attribute" || s.kind === "relation_attribute" ||
            t.kind === "attribute" || t.kind === "relation_attribute";
          return isAttrEdge ? ATTR_DIST : 130;
        })
        .strength((l) => {
          const s = l.source as ERNode;
          const t = l.target as ERNode;
          if (s.kind === "spec_circle" || t.kind === "spec_circle") return 0.5;
          return 0.25;
        })
    )
    .force("charge", d3.forceManyBody().strength(-700))
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
