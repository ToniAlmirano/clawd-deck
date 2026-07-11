import { escapeXml, svgDataUri } from "./svg";

function fmt(n: number): string {
  if (n >= 100000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return n.toLocaleString("en-US");
  return String(n);
}

export interface TotalTileOptions {
  label: string; // "WEEK" | "MONTH" | "YEAR"
  value: number;
  note?: string; // small footnote, e.g. "since Jun 20"
  accent: string;
}

/** Render a period-total "stat card" (144×144): label + big number + optional note. */
export function totalTile(o: TotalTileOptions): string {
  const num = fmt(o.value);
  const fs = num.length >= 6 ? 34 : num.length >= 5 ? 40 : num.length >= 4 ? 46 : 52;
  const y = o.note ? 96 : 104;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">`;
  s += `<rect x="5" y="5" width="134" height="134" rx="18" fill="#12161f" stroke="${o.accent}" stroke-width="2.5"/>`;
  s += `<text x="72" y="46" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="bold" fill="${o.accent}" letter-spacing="1">${escapeXml(o.label)}</text>`;
  s += `<text x="72" y="${y}" text-anchor="middle" font-family="sans-serif" font-size="${fs}" font-weight="bold" fill="#ffffff">${escapeXml(num)}</text>`;
  if (o.note) {
    s += `<text x="72" y="124" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#8d978c">${escapeXml(o.note)}</text>`;
  }
  s += `</svg>`;
  return svgDataUri(s);
}
