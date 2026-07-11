import { escapeXml, svgDataUri } from "./svg";

const GREEN = "#3ff06b";
const SEGS = 5;

function segLevel(count: number, max: number): number {
  if (count <= 0) return 0;
  return Math.min(SEGS, Math.ceil(SEGS * (max > 0 ? count / max : 1)));
}

export interface HeatmapTileOptions {
  label: string; // day, e.g. "LUN"
  count: number; // events that day
  max: number; // week max, for the segment meter
  isToday: boolean;
  noData: boolean; // no source data at all
  done: number; // tasks completed that day (✓ badge)
}

/**
 * Day tile (144×144), "4a" style: label + ✓done badge + event number + a 5-segment
 * intensity meter. Dark background; today gets a white border.
 */
export function heatmapTile(o: HeatmapTileOptions): string {
  const seg = o.noData ? 0 : segLevel(o.count, o.max);
  const dim = !o.noData && o.count <= 0;
  const labelColor = dim ? "#e7ecf277" : "#e7ecf2";
  const numColor = o.noData ? "#e7ecf2" : dim ? "#e7ecf240" : "#ffffff";
  const border = o.isToday ? "#ffffff" : "#2a3345";
  const bw = o.isToday ? 4 : 2;
  const num = o.noData ? "—" : String(o.count);
  const fs = num.length >= 4 ? 38 : num.length === 3 ? 42 : 46;

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">`;
  s += `<rect x="5" y="5" width="134" height="134" rx="18" fill="#12161c" stroke="${border}" stroke-width="${bw}"/>`;
  // label (top-left)
  s += `<text x="17" y="37" font-family="sans-serif" font-size="22" font-weight="bold" fill="${labelColor}">${escapeXml(o.label)}</text>`;
  // ✓done badge (top-right) — only when tasks were completed that day
  if (o.done > 0) {
    const txt = `✓${o.done}`;
    const bw2 = o.done >= 10 ? 44 : 36;
    const bx = 130 - bw2;
    s += `<rect x="${bx}" y="14" width="${bw2}" height="23" rx="7" fill="#1c5a30"/>`;
    s += `<text x="${bx + bw2 / 2}" y="30" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="bold" fill="#bff5d0">${txt}</text>`;
  }
  // event number (lower-left)
  s += `<text x="17" y="101" font-family="sans-serif" font-size="${fs}" font-weight="bold" fill="${numColor}">${num}</text>`;
  // 5-segment intensity meter
  const x0 = 16;
  const span = 112;
  const gap = 4;
  const w = (span - gap * (SEGS - 1)) / SEGS;
  for (let i = 0; i < SEGS; i++) {
    const on = i < seg;
    const x = x0 + i * (w + gap);
    s += `<rect x="${x.toFixed(1)}" y="118" width="${w.toFixed(1)}" height="11" rx="3" fill="${on ? GREEN : "#ffffff1a"}"/>`;
  }
  s += `</svg>`;
  return svgDataUri(s);
}
