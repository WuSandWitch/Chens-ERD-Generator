"use client";

import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const AI_PROMPT = `You are a ChenER DSL generator. Convert the user's natural language ER diagram description into valid ChenER syntax only. Output nothing except the DSL code block.

ChenER syntax rules:
- ENTITY EntityName { ... } defines a regular entity
- WEAK_ENTITY EntityName { ... } defines a weak entity (double rectangle)
- *attr inside ENTITY = primary key (underlined ellipse)
- *attr inside WEAK_ENTITY = partial key (dashed underline ellipse)
- [attr] = multi-valued attribute (double ellipse)
- (attr) = derived attribute (dashed ellipse)
- RELATION name { ... } defines a relationship (diamond)
- WEAK_RELATION name { ... } defines an identifying relationship (double diamond)
- Inside RELATION or WEAK_RELATION, each entity line has format:
    EntityName  cardinality  participation
  where cardinality is 1, N, or M and participation is total or partial (default: partial)
- Non-entity lines inside RELATION or WEAK_RELATION are relationship attributes
- SPECIALIZATION SuperclassName disjoint|overlapping total|partial { Subclass1\n  Subclass2 } defines EER specialization
  - disjoint = subclasses are mutually exclusive ("d" circle)
  - overlapping = an instance can belong to multiple subclasses ("o" circle)
  - total = every superclass instance must belong to a subclass (double line)
  - partial = participation is optional (single line)
- GENERALIZATION uses identical syntax to SPECIALIZATION
- Each subclass is listed on its own line inside the braces

Output example:
ENTITY Department {
  *dept_id
  dept_name
}
WEAK_ENTITY Dependent {
  *dep_name
  birthdate
}
RELATION employs {
  Department  1  partial
  Employee    N  total
}
WEAK_RELATION has_dependent {
  Employee   1  total
  Dependent  N  total
}`;

const SKILL_MD = `# ChenER DSL Generator Skill

## Trigger
Use this skill when the user asks to generate a ChenER ER diagram, design a database schema, or describe an entity relationship diagram in Chen's notation.

## Output Format
Output ONLY valid ChenER DSL. No explanation, no markdown prose.

## ChenER Full Syntax Reference

### Regular Entity
ENTITY EntityName {
  *primary_key
  regular_attr
  [multi_valued_attr]
  (derived_attr)
}

### Weak Entity
WEAK_ENTITY EntityName {
  *partial_key        // dashed underline
  regular_attr
}

### Regular Relationship
RELATION name {
  EntityA  1  partial
  EntityB  N  total
  rel_attr
}

### Identifying Relationship (for weak entities)
WEAK_RELATION name {
  OwnerEntity  1  total
  WeakEntity   N  total
}

## Participation Rules
- total = every instance must participate (double line)
- partial = participation is optional (single line, default)

## When to use WEAK_ENTITY
Use WEAK_ENTITY when an entity cannot be uniquely identified without its owner entity.
Always pair a WEAK_ENTITY with a WEAK_RELATION connecting it to its owner.

## Cardinality Values
- 1 = exactly one
- N = many (on one side)
- M = many (on the other side, for M:N relationships)

### Specialization / Generalization (EER)
SPECIALIZATION SuperclassName disjoint total {
  Subclass1
  Subclass2
}

GENERALIZATION SuperclassName overlapping partial {
  Entity1
  Entity2
}

- disjoint = subclasses are mutually exclusive ("d" circle rendered)
- overlapping = an instance can belong to multiple subclasses ("o" circle)
- total = every superclass instance must belong to a subclass (double line to circle)
- partial = participation in subclasses is optional (single line to circle)
- Each subclass is a separate entity; list one per line inside the braces
- Multiple SPECIALIZATION blocks on the same superclass each render as a separate circle
- GENERALIZATION uses identical syntax to SPECIALIZATION
`;

export default function AiPromptCard() {
  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(AI_PROMPT);
      toast.success("Copied to clipboard!");
    } catch {
      // Fallback for environments without clipboard API
      const el = document.createElement("textarea");
      el.value = AI_PROMPT;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      try {
        document.execCommand("copy");
        toast.success("Copied to clipboard!");
      } catch {
        toast.error("Copy failed — please copy manually.");
      }
      document.body.removeChild(el);
    }
  }

  function handleDownloadSkill() {
    const blob = new Blob([SKILL_MD], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "skill.md";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded skill.md");
  }

  return (
    <Tabs defaultValue="prompt">
      <TabsList className="mb-3">
        <TabsTrigger value="prompt">AI Prompt</TabsTrigger>
        <TabsTrigger value="skill">Claude Skill</TabsTrigger>
      </TabsList>

      <TabsContent value="prompt">
        <p className="text-sm text-muted-foreground mb-3">
          Copy this system prompt and paste it into any AI chat (Claude, ChatGPT, etc.). Then describe your ER diagram in plain language — the AI will reply with ChenER DSL you can paste directly into the editor.
        </p>
        <pre className="text-xs bg-muted rounded-md p-4 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto">
          {AI_PROMPT}
        </pre>
        <Button size="sm" variant="secondary" className="mt-2" onClick={handleCopyPrompt}>
          <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy
        </Button>
      </TabsContent>

      <TabsContent value="skill">
        <p className="text-sm text-muted-foreground mb-3">
          Download this file and add it to your Claude project as a custom skill. Claude will then automatically generate ChenER DSL whenever you describe an ER diagram, without needing to paste a prompt each time.
        </p>
        <pre className="text-xs bg-muted rounded-md p-4 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto">
          {SKILL_MD}
        </pre>
        <Button size="sm" variant="secondary" className="mt-2" onClick={handleDownloadSkill}>
          <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download skill.md
        </Button>
      </TabsContent>
    </Tabs>
  );
}
