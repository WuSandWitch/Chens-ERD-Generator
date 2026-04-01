export type AttributeType =
  | "regular"
  | "primary_key"
  | "partial_key"
  | "multi_valued"
  | "derived";

export interface Attribute {
  name: string;
  type: AttributeType;
}

export type Participation = "total" | "partial";

export interface EntityDef {
  kind: "entity" | "weak_entity";
  name: string;
  attributes: Attribute[];
}

export interface RelationParticipant {
  entityName: string;
  cardinality: "1" | "N" | "M";
  participation: Participation;
}

export interface RelationDef {
  kind: "relation" | "weak_relation";
  name: string;
  participants: RelationParticipant[];
  attributes: string[];
}

export type Definition = EntityDef | RelationDef;

export interface ParseResult {
  definitions: Definition[];
  errors: string[];
}

// D3 simulation node types
export type NodeKind =
  | "entity"
  | "weak_entity"
  | "relation"
  | "weak_relation"
  | "attribute"
  | "relation_attribute";

export interface ERNode {
  id: string;
  kind: NodeKind;
  label: string;
  attributeType?: AttributeType;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface ERLink {
  source: string | ERNode;
  target: string | ERNode;
  cardinality?: string;
  cardinalityEnd?: "source" | "target";
  participation?: Participation;
}

export interface ERGraph {
  nodes: ERNode[];
  links: ERLink[];
}
