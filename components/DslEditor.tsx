"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface DslEditorProps {
  value: string;
  onChange: (v: string) => void;
  onRender: () => void;
  errors: string[];
}

const QUICK_REF = [
  {
    title: "Regular Entity",
    content: `ENTITY Name {\n  *primary_key\n  regular_attr\n  [multi_valued]\n  (derived)\n}`,
  },
  {
    title: "Weak Entity",
    content: `WEAK_ENTITY Name {\n  *partial_key   // dashed underline\n  regular_attr\n}`,
  },
  {
    title: "Relationship",
    content: `RELATION name {\n  EntityA  1  partial\n  EntityB  N  total\n  rel_attr\n}`,
  },
  {
    title: "Identifying Relationship",
    content: `WEAK_RELATION name {\n  OwnerEntity  1  total\n  WeakEntity   N  total\n}`,
  },
  {
    title: "Cardinality",
    content: "1 — one\nN — many\nM — many (M:N)",
  },
  {
    title: "Participation",
    content: "total   → double line (mandatory)\npartial → single line (optional, default)",
  },
  {
    title: "Attribute prefixes",
    content: "*attr  → primary key (underlined)\n*attr  → partial key in WEAK_ENTITY (dashed)\n[attr] → multi-valued (double ellipse)\n(attr) → derived (dashed ellipse)\nattr   → regular",
  },
  {
    title: "Specialization / Generalization",
    content: `SPECIALIZATION SuperclassName disjoint total {\n  Subclass1\n  Subclass2\n}\n\nGENERALIZATION SuperclassName overlapping partial {\n  Entity1\n  Entity2\n}\n\n// disjoint → "d" circle, overlapping → "o" circle\n// total → double line, partial → single line\n// Arrow on each subclass line points toward circle`,
  },
];

export default function DslEditor({
  value,
  onChange,
  onRender,
  errors,
}: DslEditorProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onRender();
    }
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
          ChenER DSL
        </h2>
        <span className="text-xs text-muted-foreground">⌘↵ to render</span>
      </div>

      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="ENTITY Student { ... }"
        className="flex-1 min-h-[260px] font-mono text-sm resize-none"
        spellCheck={false}
      />

      <Button onClick={onRender} className="w-full">
        Render
      </Button>

      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs font-mono whitespace-pre-wrap">
            {errors.join("\n")}
          </AlertDescription>
        </Alert>
      )}

      <Accordion type="single" collapsible className="text-sm">
        <AccordionItem value="ref">
          <AccordionTrigger className="text-xs text-muted-foreground py-2">
            DSL Quick Reference
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-3">
              {QUICK_REF.map((item) => (
                <div key={item.title}>
                  <p className="text-xs font-semibold mb-1 text-muted-foreground">
                    {item.title}
                  </p>
                  <pre className="text-xs bg-muted rounded p-2 overflow-x-auto">
                    {item.content}
                  </pre>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
