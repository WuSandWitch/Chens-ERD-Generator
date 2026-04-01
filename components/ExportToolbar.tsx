"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { downloadSVG, downloadPNG } from "@/lib/export";
import { toast } from "sonner";

interface ExportToolbarProps {
  svgRef: React.RefObject<SVGSVGElement | null>;
  onResetView: () => void;
  onAutoLayout: () => void;
}

export default function ExportToolbar({ svgRef, onResetView, onAutoLayout }: ExportToolbarProps) {
  function handleDownloadSVG() {
    if (!svgRef.current) return;
    downloadSVG(svgRef.current);
    toast.success("Downloaded diagram.svg");
  }

  function handleDownloadPNG() {
    if (!svgRef.current) return;
    downloadPNG(svgRef.current);
    toast.success("Downloading diagram.png…");
  }

  return (
    <div className="flex gap-2 flex-wrap">
      <Button variant="outline" size="sm" onClick={onAutoLayout} title="Auto layout">
        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
        Layout
      </Button>
      <Button variant="outline" size="sm" onClick={handleDownloadSVG} title="Download SVG">
        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        SVG
      </Button>
      <Button variant="outline" size="sm" onClick={handleDownloadPNG} title="Download PNG">
        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        PNG
      </Button>
      <Button variant="outline" size="sm" onClick={onResetView} title="Reset view">
        <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
        Reset
      </Button>
    </div>
  );
}
