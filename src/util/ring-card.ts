import { escapeXml, svgDataUri } from "./svg";

// Arc starting at 12 o'clock, clockwise, WITHOUT transform (the deck's SVG
// renderer ignores transform/viewBox/<g>), so we compute the path by hand.
function arc(cx: number, cy: number, r: number, pct: number): string {
  const p = Math.max(0, Math.min(0.9999, pct));
  const a0 = -Math.PI / 2;
  const a1 = a0 + 2 * Math.PI * p;
  const x1 = cx + r * Math.cos(a0);
  const y1 = cy + r * Math.sin(a0);
  const x2 = cx + r * Math.cos(a1);
  const y2 = cy + r * Math.sin(a1);
  const large = p > 0.5 ? 1 : 0;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

export interface RingTileOptions {
  top: string; // header label
  big: string; // center value
  small: string; // center caption
  pct: number; // 0..1
  accent: string;
}

/** Ring/progress tile (144×144): header + circular progress + center value. */
export function ringTile(o: RingTileOptions): string {
  const cx = 72;
  const cy = 82;
  const r = 46;
  const pct = Math.max(0, Math.min(1, o.pct));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">`;
  s += `<rect x="5" y="5" width="134" height="134" rx="18" fill="#12161f" stroke="#2a3345" stroke-width="2"/>`;
  s += `<text x="72" y="30" text-anchor="middle" font-family="sans-serif" font-size="15" font-weight="bold" fill="${o.accent}">${escapeXml(o.top)}</text>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff14" stroke-width="12"/>`;
  if (pct >= 0.999) {
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${o.accent}" stroke-width="12"/>`;
  } else if (pct > 0) {
    s += `<path d="${arc(cx, cy, r, pct)}" fill="none" stroke="${o.accent}" stroke-width="12" stroke-linecap="round"/>`;
  }
  s += `<text x="72" y="${cy + 3}" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="bold" fill="#ffffff">${escapeXml(o.big)}</text>`;
  s += `<text x="72" y="${cy + 21}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#8d978c">${escapeXml(o.small)}</text>`;
  s += `</svg>`;
  return svgDataUri(s);
}
