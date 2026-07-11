import { escapeXml, svgDataUri } from "./svg";

export interface IconTileOptions {
  emoji: string; // 🔥 / 🏆
  value: string;
  label: string;
  c1: string; // gradient top
  c2: string; // gradient bottom
  fg?: string; // text color (default white)
}

/** Gradient stat tile with an emoji, big value and label (RACHA / RÉCORD). */
export function iconTile(o: IconTileOptions): string {
  const fg = o.fg ?? "#ffffff";
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">`;
  s += `<defs><radialGradient id="ig" cx="50%" cy="0%" r="120%"><stop offset="0" stop-color="${o.c1}"/><stop offset="1" stop-color="${o.c2}"/></radialGradient></defs>`;
  s += `<rect x="5" y="5" width="134" height="134" rx="18" fill="url(#ig)"/>`;
  s += `<text x="72" y="55" text-anchor="middle" font-family="sans-serif" font-size="32">${o.emoji}</text>`;
  s += `<text x="72" y="99" text-anchor="middle" font-family="sans-serif" font-size="30" font-weight="bold" fill="${fg}">${escapeXml(o.value)}</text>`;
  s += `<text x="72" y="121" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="bold" fill="${fg}" opacity="0.85">${escapeXml(o.label)}</text>`;
  s += `</svg>`;
  return svgDataUri(s);
}
