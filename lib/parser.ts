import type {
  ParseResult,
  Definition,
  EntityDef,
  RelationDef,
  SpecGenDef,
  SpecConstraint,
  Attribute,
  AttributeType,
  Participation,
} from "./types";

function parseAttribute(raw: string, isWeak: boolean): Attribute {
  const trimmed = raw.trim();
  if (trimmed.startsWith("*")) {
    const type: AttributeType = isWeak ? "partial_key" : "primary_key";
    return { name: trimmed.slice(1).trim(), type };
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return { name: trimmed.slice(1, -1).trim(), type: "multi_valued" };
  }
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return { name: trimmed.slice(1, -1).trim(), type: "derived" };
  }
  return { name: trimmed, type: "regular" };
}

export function parseDSL(input: string): ParseResult {
  const errors: string[] = [];
  const definitions: Definition[] = [];

  // Strip line comments
  const stripped = input.replace(/\/\/[^\n]*/g, "");

  // ── First pass: collect entity names (regular + weak) ──────────────
  const entityNames = new Set<string>();

  const firstPassRegex = /(?:WEAK_ENTITY|ENTITY)\s+(\w+)\s*\{/g;
  let fp: RegExpExecArray | null;
  while ((fp = firstPassRegex.exec(stripped)) !== null) {
    entityNames.add(fp[1]);
  }

  // Also collect superclass and subclass names from SPECIALIZATION/GENERALIZATION
  // so that RELATION blocks can reference them as participants.
  const specFirstPassRegex =
    /(?:SPECIALIZATION|GENERALIZATION)\s+(\w+)\s+(?:disjoint|overlapping)\s+(?:total|partial)\s*\{([^}]*)\}/g;
  let sfp: RegExpExecArray | null;
  while ((sfp = specFirstPassRegex.exec(stripped)) !== null) {
    entityNames.add(sfp[1]); // superclass
    for (const line of sfp[2].split("\n").map((l) => l.trim()).filter(Boolean)) {
      entityNames.add(line); // each subclass
    }
  }

  // ── Parse ENTITY / WEAK_ENTITY / RELATION / WEAK_RELATION blocks ───
  const blockRegex =
    /(WEAK_ENTITY|ENTITY|WEAK_RELATION|RELATION)\s+(\w+)\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(stripped)) !== null) {
    const keyword = match[1] as
      | "ENTITY"
      | "WEAK_ENTITY"
      | "RELATION"
      | "WEAK_RELATION";
    const name = match[2];
    const body = match[3];

    const lines = body
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (keyword === "ENTITY" || keyword === "WEAK_ENTITY") {
      const isWeak = keyword === "WEAK_ENTITY";
      const attributes: Attribute[] = [];
      for (const line of lines) {
        const attr = parseAttribute(line, isWeak);
        if (attr.name) attributes.push(attr);
      }
      definitions.push({
        kind: isWeak ? "weak_entity" : "entity",
        name,
        attributes,
      } as EntityDef);
    } else {
      // RELATION or WEAK_RELATION
      const isWeak = keyword === "WEAK_RELATION";
      const participants: RelationDef["participants"] = [];
      const relAttributes: string[] = [];

      for (const line of lines) {
        const parts = line.split(/\s+/);
        // Entity line: EntityName  cardinality  [participation]
        if (
          parts.length >= 2 &&
          entityNames.has(parts[0]) &&
          /^[1NM]$/.test(parts[1])
        ) {
          const participation: Participation =
            parts[2] === "total" ? "total" : "partial";
          participants.push({
            entityName: parts[0],
            cardinality: parts[1] as "1" | "N" | "M",
            participation,
          });
        } else if (parts.length === 1 && parts[0]) {
          relAttributes.push(parts[0]);
        } else if (line.trim()) {
          relAttributes.push(line.trim());
        }
      }

      if (participants.length < 2) {
        errors.push(
          `${keyword} "${name}" must reference at least two entities with cardinality.`
        );
      }

      definitions.push({
        kind: isWeak ? "weak_relation" : "relation",
        name,
        participants,
        attributes: relAttributes,
      } as RelationDef);
    }
  }

  // ── Parse SPECIALIZATION / GENERALIZATION blocks ────────────────────
  // Syntax: SPECIALIZATION SuperclassName disjoint|overlapping total|partial {
  //           Subclass1
  //           Subclass2
  //         }
  const specRegex =
    /(SPECIALIZATION|GENERALIZATION)\s+(\w+)\s+(disjoint|overlapping)\s+(total|partial)\s*\{([^}]*)\}/g;
  let sm: RegExpExecArray | null;

  while ((sm = specRegex.exec(stripped)) !== null) {
    const keyword = sm[1] as "SPECIALIZATION" | "GENERALIZATION";
    const superclass = sm[2];
    const constraint = sm[3] as SpecConstraint;
    const participation = sm[4] as Participation;
    const body = sm[5];

    const subclasses = body
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (subclasses.length === 0) {
      errors.push(`${keyword} "${superclass}" must list at least one subclass.`);
      continue;
    }

    definitions.push({
      kind: keyword === "SPECIALIZATION" ? "specialization" : "generalization",
      superclass,
      constraint,
      participation,
      subclasses,
    } as SpecGenDef);
  }

  if (definitions.length === 0 && stripped.trim().length > 0) {
    errors.push(
      "No valid ENTITY, WEAK_ENTITY, RELATION, WEAK_RELATION, SPECIALIZATION, or GENERALIZATION blocks found."
    );
  }

  return { definitions, errors };
}
