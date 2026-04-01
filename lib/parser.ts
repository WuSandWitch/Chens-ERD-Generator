import type {
  ParseResult,
  Definition,
  EntityDef,
  RelationDef,
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

  // Match top-level blocks — WEAK_* must come before bare ENTITY/RELATION
  const blockRegex =
    /(WEAK_ENTITY|ENTITY|WEAK_RELATION|RELATION)\s+(\w+)\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;

  const entityNames = new Set<string>();

  // First pass: collect all entity names (both regular and weak)
  const firstPassRegex = /(?:WEAK_ENTITY|ENTITY)\s+(\w+)\s*\{/g;
  let fp: RegExpExecArray | null;
  while ((fp = firstPassRegex.exec(stripped)) !== null) {
    entityNames.add(fp[1]);
  }

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
          // Fallback: treat unrecognised lines as attributes
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

  if (definitions.length === 0 && stripped.trim().length > 0) {
    errors.push("No valid ENTITY, WEAK_ENTITY, RELATION, or WEAK_RELATION blocks found.");
  }

  return { definitions, errors };
}
