/** Resolve all hsl(var(--xxx)) occurrences in SVG markup to concrete hsl() values. */
function resolveVars(svgStr: string): string {
  const docStyle = getComputedStyle(document.documentElement);
  return svgStr.replace(/hsl\(var\((--[\w-]+)\)\)/g, (_, varName: string) => {
    const val = docStyle.getPropertyValue(varName).trim();
    return val ? `hsl(${val})` : "currentColor";
  });
}

/** Clone SVG, resolve CSS vars, return serialized string. */
function prepareSvgString(svgEl: SVGSVGElement): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const raw = new XMLSerializer().serializeToString(clone);
  return resolveVars(raw);
}

function getExportRoot(svgEl: SVGSVGElement) {
  return svgEl.querySelector<SVGGElement>('[data-export-root="true"]');
}

function getExportMarkup(svgEl: SVGSVGElement, padding = 24) {
  const root = getExportRoot(svgEl);
  if (!root) return null;

  const bounds = root.getBBox();
  if (bounds.width === 0 || bounds.height === 0) return null;

  const exportWidth = bounds.width + padding * 2;
  const exportHeight = bounds.height + padding * 2;
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue("--background")
    .trim();

  const rootClone = root.cloneNode(true) as SVGGElement;
  rootClone.removeAttribute("transform");
  rootClone.setAttribute(
    "transform",
    `translate(${padding - bounds.x}, ${padding - bounds.y})`
  );

  const exportSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  exportSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  exportSvg.setAttribute("width", String(exportWidth));
  exportSvg.setAttribute("height", String(exportHeight));
  exportSvg.setAttribute("viewBox", `0 0 ${exportWidth} ${exportHeight}`);

  const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute("fill", bg ? `hsl(${bg})` : "#ffffff");

  exportSvg.append(background, rootClone);

  const raw = new XMLSerializer().serializeToString(exportSvg);
  return {
    svgStr: resolveVars(raw),
    width: exportWidth,
    height: exportHeight,
  };
}

export function downloadSVG(svgEl: SVGSVGElement, filename = "diagram.svg") {
  const exportMarkup = getExportMarkup(svgEl);
  const svgStr = exportMarkup?.svgStr ?? prepareSvgString(svgEl);
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  triggerDownload(blob, filename);
}

export function downloadPNG(
  svgEl: SVGSVGElement,
  filename = "diagram.png",
  scale = 2
) {
  const exportMarkup = getExportMarkup(svgEl);
  const svgStr = exportMarkup?.svgStr ?? prepareSvgString(svgEl);
  const width = Math.ceil((exportMarkup?.width ?? svgEl.getBoundingClientRect().width) * scale);
  const height = Math.ceil((exportMarkup?.height ?? svgEl.getBoundingClientRect().height) * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // Fill background using the page background color
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue("--background").trim();
  ctx.fillStyle = bg ? `hsl(${bg})` : "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const img = new Image();
  const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  img.onload = () => {
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (blob) triggerDownload(blob, filename);
    }, "image/png");
  };
  img.src = url;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
