import { escapeXml, svgDataUri } from "./svg";
import { t } from "./i18n";

type Severity = "normal" | "warn" | "crit";
const SEV_COLOR: Record<Severity, string> = {
  normal: "#D97757", // Claude orange (coral/clay)
  warn: "#f5b22a", // amber
  crit: "#ff5a5a", // red
};
function severity(p: number): Severity {
  return p >= 90 ? "crit" : p >= 70 ? "warn" : "normal";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Hours:minutes remaining until reset, e.g. "3:59" (5-hour session window). */
function fmtHM(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso) - Date.now();
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "0:00";
  const totalMin = Math.floor(ms / 60_000);
  return `${Math.floor(totalMin / 60)}:${pad2(totalMin % 60)}`;
}

/** Days remaining + reset clock in 12h am/pm, e.g. "1D 03am" (weekly window). */
function fmtDayClock(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso) - Date.now();
  if (Number.isNaN(ms)) return "";
  const days = Math.floor(Math.max(0, ms) / 86_400_000);
  const dt = new Date(iso);
  const hh = dt.getHours();
  const ampm = hh < 12 ? "am" : "pm";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${days}D ${pad2(h12)}${ampm}`;
}

export interface UsageTileOptions {
  label: string;
  percent: number | null;
  resetsAt: string | null;
  /** Which window — drives the reset-time format. */
  metric: "session" | "weekly";
  /** 0 = left key, 1 = right key. Together they form one 288×144 widget. */
  keyIndex: number;
}

/**
 * Render one 144×144 key of a 2-key-wide usage gauge. The full widget is drawn
 * on a 288-wide virtual canvas; each key shows its half via an X offset (no
 * <g>/transform/viewBox — the Stream Deck SVG renderer only does flat shapes).
 */
export function usageTile(opts: UsageTileOptions): string {
  const W = 288;
  const ox = opts.keyIndex * 144;
  const X = (ax: number): string => (ax - ox).toFixed(1);

  const has = opts.percent != null;
  const p = Math.max(0, Math.min(100, opts.percent ?? 0));
  const color = has ? SEV_COLOR[severity(p)] : "#6b7480";
  const bg = "#0f1621";

  // Progress bar geometry on the virtual canvas.
  const barX = 24;
  const barW = W - 48;
  const barY = 102;
  const barH = 18;
  const fillW = (barW * p) / 100;

  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">`;
  // Card background spanning both keys (rounded both ends; bezel hides the seam).
  out += `<rect x="${X(4)}" y="6" width="${W - 8}" height="132" rx="20" fill="${bg}" stroke="${color}" stroke-width="3"/>`;
  // Label — left key.
  out += `<text x="${X(26)}" y="48" font-family="sans-serif" font-size="23" font-weight="bold" fill="${color}">${escapeXml(t(opts.label))}</text>`;
  // Big percent — right key, right-aligned.
  out += `<text x="${X(W - 26)}" y="54" text-anchor="end" font-family="sans-serif" font-size="46" font-weight="bold" fill="#ffffff">${has ? `${p}%` : "—"}</text>`;
  // Bar track + fill — spans both keys.
  out += `<rect x="${X(barX)}" y="${barY}" width="${barW}" height="${barH}" rx="10" fill="#ffffff22"/>`;
  if (has && fillW > 1) {
    out += `<rect x="${X(barX)}" y="${barY}" width="${fillW.toFixed(1)}" height="${barH}" rx="10" fill="${color}"/>`;
  }
  // Reset countdown — left key, below the bar.
  const reset = !has
    ? t("no data")
    : opts.metric === "session"
      ? fmtHM(opts.resetsAt)
      : fmtDayClock(opts.resetsAt);
  out += `<text x="${X(26)}" y="80" font-family="sans-serif" font-size="24" font-weight="bold" fill="#ffffff">${escapeXml(reset)}</text>`;
  out += `</svg>`;
  return svgDataUri(out);
}
