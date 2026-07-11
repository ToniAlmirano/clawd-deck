import { escapeXml, svgDataUri } from "./svg";

export interface BarTileOptions {
  label: string;
  value: string; // formatted number
  sub: string; // e.g. "+14 TASKS ✓"
  pct: number; // 0..1 progress toward personal best
  accent: string;
}

/** Total tile with a progress bar (144×144): label + number + bar + subtitle. */
export function barTile(o: BarTileOptions): string {
  const pct = Math.max(0, Math.min(1, o.pct));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">`;
  s += `<rect x="5" y="5" width="134" height="134" rx="18" fill="#12161f" stroke="${o.accent}" stroke-width="2.5"/>`;
  s += `<text x="17" y="44" font-family="sans-serif" font-size="19" font-weight="bold" fill="${o.accent}">${escapeXml(o.label)}</text>`;
  s += `<text x="17" y="90" font-family="sans-serif" font-size="34" font-weight="bold" fill="#ffffff">${escapeXml(o.value)}</text>`;
  s += `<rect x="17" y="101" width="110" height="11" rx="6" fill="#ffffff1a"/>`;
  if (pct > 0) s += `<rect x="17" y="101" width="${(110 * pct).toFixed(0)}" height="11" rx="6" fill="${o.accent}"/>`;
  s += `<text x="17" y="129" font-family="sans-serif" font-size="11.5" font-weight="bold" fill="#8d978c">${escapeXml(o.sub)}</text>`;
  s += `</svg>`;
  return svgDataUri(s);
}
