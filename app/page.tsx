"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import * as d3 from "d3";
import { useTheme } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import ChenCanvas from "@/components/ChenCanvas";
import DslEditor from "@/components/DslEditor";
import ExportToolbar from "@/components/ExportToolbar";
import AiPromptCard from "@/components/AiPromptCard";
import { parseDSL } from "@/lib/parser";
import { buildGraph, runSimulation } from "@/lib/layout";
import type { Definition, ERGraph } from "@/lib/types";

const EXAMPLE_DSL = `ENTITY Department {
  *dept_id
  dept_name
  location
}

ENTITY Employee {
  *emp_id
  name
  [phone]
  (years_of_service)
}

WEAK_ENTITY Dependent {
  *dep_name
  birthdate
  relationship
}

RELATION works_in {
  Employee    N  total
  Department  1  partial
}

RELATION manages {
  Employee    1  partial
  Department  1  partial
}

WEAK_RELATION has_dependent {
  Employee   1  total
  Dependent  N  total
}`;

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const isDark = theme === "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      {isDark ? (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m8.66-9h-1M4.34 12h-1m15.07-6.07l-.71.71M6.34 17.66l-.71.71m12.73 0l-.71-.71M6.34 6.34l-.71-.71M12 5a7 7 0 100 14A7 7 0 0012 5z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </Button>
  );
}

export default function Home() {
  const [dsl, setDsl] = useState(EXAMPLE_DSL);
  const [graph, setGraph] = useState<ERGraph | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  // Keep last parsed definitions so auto-layout can re-run without re-parsing
  const definitionsRef = useRef<Definition[]>([]);

  const handleRender = useCallback(() => {
    const result = parseDSL(dsl);
    setErrors(result.errors);
    if (result.definitions.length > 0) {
      definitionsRef.current = result.definitions;
      const g = buildGraph(result.definitions);
      const laid = runSimulation(g);
      setGraph({ ...laid });
    } else if (result.errors.length === 0) {
      setGraph(null);
    }
  }, [dsl]);

  // Render on first load with example
  useEffect(() => {
    handleRender();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleZoomReady = useCallback(
    (zoom: d3.ZoomBehavior<SVGSVGElement, unknown>) => {
      zoomBehaviorRef.current = zoom;
    },
    []
  );

  function handleResetView() {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(400)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity);
  }

  // Re-run layout from scratch with fresh node positions (no re-parse needed)
  function handleAutoLayout() {
    if (definitionsRef.current.length === 0) return;
    const g = buildGraph(definitionsRef.current);
    const laid = runSimulation(g);
    setGraph({ ...laid });
  }

  return (
    <>
      <Toaster richColors position="bottom-right" />
      <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
        {/* Header */}
        <header className="border-b px-4 py-2.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-primary">
              <rect x="1" y="1" width="20" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
              <ellipse cx="11" cy="17" rx="7" ry="4" stroke="currentColor" strokeWidth="1.8" />
              <line x1="11" y1="10" x2="11" y2="13" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            <span className="font-bold tracking-tight">
              Chen's ERD Generator
            </span>
            <a
              href="https://wusandwitch.zudo.cc"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              @WuSandWitch
            </a>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            
            <a
              href="https://github.com/Chens-ERD-Generator"
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m12 2.5 2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52 6.12 20.61l1.12-6.55L2.48 9.42l6.58-.96L12 2.5Z" />
              </svg>
              Star
            </a>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Use with AI
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Use with AI</DialogTitle>
                </DialogHeader>
                <AiPromptCard />
              </DialogContent>
            </Dialog>
            <ThemeToggle />
          </div>
        </header>

        {/* Main split layout */}
        <div className="flex flex-1 overflow-hidden flex-col md:flex-row min-h-0">
          {/* Left panel — editor */}
          <aside className="w-full md:w-[380px] md:shrink-0 border-b md:border-b-0 md:border-r p-4 overflow-y-auto order-2 md:order-1">
            <DslEditor
              value={dsl}
              onChange={setDsl}
              onRender={handleRender}
              errors={errors}
            />
          </aside>

          {/* Right panel — canvas */}
          <main className="flex-1 flex flex-col overflow-hidden order-1 md:order-2">
            <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
              <span className="text-xs text-muted-foreground font-medium">Diagram Canvas</span>
              <ExportToolbar
                svgRef={svgRef}
                onResetView={handleResetView}
                onAutoLayout={handleAutoLayout}
              />
            </div>
            <div className="flex-1 overflow-hidden min-h-[340px] md:min-h-0">
              <ChenCanvas graph={graph} svgRef={svgRef} onZoomReady={handleZoomReady} />
            </div>
          </main>
        </div>

      </div>
    </>
  );
}
