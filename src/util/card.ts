import { basename } from "node:path";
import { State, type SessionState } from "../types";
import { escapeXml, svgDataUri } from "./svg";
import { t } from "./i18n";

const CLAWD = "#DE886D"; // authentic clawd-tank body color
const EYE = "#000000";

interface StateStyle {
  label: string;
  color: string; // bright accent (border, label)
  bg: string; // tile fill
  attention: boolean; // true = "needs you" → pops + pulses; false = calm
}

// Workflow-tuned: WORKING is calm (busy, ignore it); "TU TURNO" / "PREGUNTA"
// grab attention (the agent finished / is waiting for you).
const STYLES: Record<State, StateStyle> = {
  [State.DISCONNECTED]: { label: "OFFLINE", color: "#6b7480", bg: "#13161b", attention: false },
  [State.IDLE]: { label: "YOUR TURN", color: "#46e06b", bg: "#123a20", attention: true },
  [State.PROCESSING]: { label: "WORKING", color: "#3f6796", bg: "#0f1621", attention: false },
  [State.AWAITING_PERMISSION]: { label: "PERMISSION", color: "#f5b22a", bg: "#352703", attention: true },
  [State.AWAITING_ELICITATION]: { label: "QUESTION", color: "#c79bff", bg: "#271b3f", attention: true },
};

// Acknowledged "needs you" states (you already clicked/saw them) render calm here:
// dim green, no pulse — "ya lo viste, te toca escribir algo".
const PENDIENTE: StateStyle = { label: "PENDING", color: "#3f8f57", bg: "#12241a", attention: false };

/** "claude-opus-4-8" → "Opus 4.8". Falls back to the raw id (minus the claude- prefix). */
export function formatModel(m: string | null): string {
  if (!m) return "";
  const lo = m.toLowerCase();
  const fam = lo.includes("opus")
    ? "Opus"
    : lo.includes("sonnet")
      ? "Sonnet"
      : lo.includes("haiku")
        ? "Haiku"
        : lo.includes("fable")
          ? "Fable"
          : "";
  const ver = m.match(/(\d+)[-.](\d+)/);
  const v = ver ? `${ver[1]}.${ver[2]}` : "";
  if (!fam) return m.replace(/^claude-/, "");
  return v ? `${fam} ${v}` : fam;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// Friendly display names per project. Key = the project FOLDER name (what shows
// by default, i.e. basename of the cwd). Add entries here to override the label
// shown under Clawd; anything not listed falls back to the folder name. Long
// values still get truncated to fit the key.
const PROJECT_NAMES: Record<string, string> = {
  // "my-very-long-project-name": "Short",
  // "acme-website-2026": "Acme",
};

/** Resolve the label under Clawd from a session cwd (folder name, or its alias). */
function projectLabel(cwd: string): string {
  const base = basename(cwd) || "session";
  return PROJECT_NAMES[base] ?? base;
}

const BOB = [0, -0.3, -0.6, -0.8, -0.8, -0.6, -0.3, 0];
const WAVE = [0, 1.3, 2.5, 1.3];
const PULSE = [0, 0.25, 0.5, 0.75, 0.95, 1, 0.95, 0.75, 0.5, 0.25];

// Local crab coords (0..15 / 6..16) mapped into a 92×78 box at (26,34).
// IMPORTANT: emit flat <rect>/<circle>/<text> only — the Stream Deck SVG
// renderer does NOT support nested <svg>, <g>, or transforms.
const SX = 92 / 19;
const SY = 78 / 16;
const px = (lx: number): string => (26 + (lx + 2) * SX).toFixed(1);
const py = (ly: number): string => (34 + (ly - 2) * SY).toFixed(1);
const pw = (w: number): string => (w * SX).toFixed(1);
const ph = (h: number): string => (h * SY).toFixed(1);

/** Stable 0..n-1 per string (project cwd) → each project gets a distinct working pose. */
function hashVariant(s: string, n: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % n;
}

// Working-state poses (flat, axis-aligned, animated by frame). One per project so
// sessions look different from each other. All overlay the base crab.
function poseThinking(accent: string, frame: number): string {
  const n = Math.floor(frame / 3) % 4; // 0..3 dots cycle
  const dx = [13, 15, 17];
  let s = "";
  for (let i = 0; i < n; i++) s += `<circle cx="${px(dx[i])}" cy="${py(4.3)}" r="${(0.8 * SX).toFixed(1)}" fill="${accent}"/>`;
  return s;
}
function poseHammer(accent: string, frame: number): string {
  const y = frame % 4 < 2 ? 2.2 : 4.4; // raised vs striking
  return (
    `<rect x="${px(14.5)}" y="${py(y + 0.9)}" width="${pw(0.7)}" height="${ph(3.0)}" fill="${accent}"/>` +
    `<rect x="${px(13.3)}" y="${py(y)}" width="${pw(3.2)}" height="${ph(1.4)}" fill="${accent}"/>`
  );
}
function poseSparkles(accent: string, frame: number): string {
  const spots: [number, number][] = [
    [13.8, 3.4],
    [0.4, 4.2],
    [15.6, 8],
  ];
  let s = "";
  spots.forEach(([x, y], i) => {
    if ((frame + i * 3) % 9 < 5) {
      s +=
        `<rect x="${px(x - 0.8)}" y="${py(y - 0.15)}" width="${pw(1.6)}" height="${ph(0.3)}" fill="${accent}"/>` +
        `<rect x="${px(x - 0.15)}" y="${py(y - 0.8)}" width="${pw(0.3)}" height="${ph(1.6)}" fill="${accent}"/>`;
    }
  });
  return s;
}
function poseLoadBar(accent: string, frame: number): string {
  const p = (frame % 20) / 20;
  return (
    `<rect x="${px(3)}" y="${py(3)}" width="${pw(9)}" height="${ph(1.3)}" fill="#000" fill-opacity="0.35"/>` +
    `<rect x="${px(3)}" y="${py(3)}" width="${pw(9 * p)}" height="${ph(1.3)}" fill="${accent}"/>`
  );
}
function workingPose(variant: number, accent: string, frame: number): string {
  switch (((variant % 4) + 4) % 4) {
    case 0:
      return poseThinking(accent, frame);
    case 1:
      return poseHammer(accent, frame);
    case 2:
      return poseSparkles(accent, frame);
    default:
      return poseLoadBar(accent, frame);
  }
}

/** Authentic clawd-tank crab, animated, drawn flat (no groups/transforms). */
function clawd(state: State, accent: string, frame: number, calm = false, variant = 0): string {
  const sleeping = state === State.DISCONNECTED;
  const done = !calm && state === State.IDLE;
  const alert = !calm && (state === State.AWAITING_PERMISSION || state === State.AWAITING_ELICITATION);
  const working = state === State.PROCESSING;

  const dy = sleeping ? 0 : BOB[frame % BOB.length];
  const blink = !sleeping && frame % 22 === 0;
  const armUp = done ? WAVE[frame % WAVE.length] : 0;
  const fo = sleeping ? ' fill-opacity="0.55"' : "";

  const r = (lx: number, ly: number, w: number, h: number, fill: string): string =>
    `<rect x="${px(lx)}" y="${py(ly)}" width="${pw(w)}" height="${ph(h)}" fill="${fill}"${fo}/>`;

  let out =
    `<rect x="${px(3)}" y="${py(15)}" width="${pw(9)}" height="${ph(1)}" fill="#000" fill-opacity="0.35"/>` +
    r(2, 6 + dy, 11, 7, CLAWD) +
    r(0, 9 + dy, 2, 2, CLAWD) +
    r(13, 9 - armUp + dy, 2, 2, CLAWD) +
    r(3, 13 + dy, 1, 2, CLAWD) +
    r(5, 13 + dy, 1, 2, CLAWD) +
    r(9, 13 + dy, 1, 2, CLAWD) +
    r(11, 13 + dy, 1, 2, CLAWD);

  out +=
    sleeping || blink
      ? r(4, 9 + dy, 1, 0.5, EYE) + r(10, 9 + dy, 1, 0.5, EYE)
      : r(4, 8 + dy, 1, 2, EYE) + r(10, 8 + dy, 1, 2, EYE);

  if (working) {
    out += workingPose(variant, accent, frame);
  } else if (alert) {
    const fs = (frame % 2 === 0 ? 7.5 : 6.2) * SY;
    out += `<text x="${px(13)}" y="${py(6 + dy)}" font-family="sans-serif" font-size="${fs.toFixed(1)}" font-weight="bold" fill="${accent}">?</text>`;
  } else if (sleeping) {
    const zc = frame % 14;
    const op = Math.max(0, 1 - zc / 14).toFixed(2);
    out += `<text x="${px(13)}" y="${py(6.5 - zc * 0.32)}" font-family="sans-serif" font-size="${(5.5 * SY).toFixed(1)}" font-weight="bold" fill="${accent}" opacity="${op}">z</text>`;
  }

  return out;
}

/** Full 144×144 "session card" for a given animation frame. */
export function sessionCardImage(
  session: SessionState | null,
  count: number,
  index: number,
  frame = 0,
): string {
  const state = session ? session.state : State.DISCONNECTED;
  const seen =
    !!session?.acknowledged &&
    (state === State.IDLE ||
      state === State.AWAITING_PERMISSION ||
      state === State.AWAITING_ELICITATION);
  const style = seen ? PENDIENTE : STYLES[state];
  const variant = session ? hashVariant(session.cwd, 4) : 0;
  // Priority: user's iTerm2 tab rename → alias map → project folder name.
  const project = session ? truncate(session.customTitle ?? projectLabel(session.cwd), 11) : "—";
  const model = session ? formatModel(session.model) : "";
  const corner = count > 1 ? `${index + 1}/${count}` : "";

  const pulse = style.attention ? PULSE[frame % PULSE.length] : 0;
  const strokeW = style.attention ? 5 + 4 * pulse : 3;
  const halo = style.attention
    ? `<rect x="6" y="6" width="132" height="132" rx="16" fill="none" stroke="${style.color}" stroke-width="3" opacity="${(0.55 * pulse).toFixed(2)}"/>`
    : "";

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144">` +
    `<rect x="3" y="3" width="138" height="138" rx="18" fill="${style.bg}" stroke="${style.color}" stroke-width="${strokeW.toFixed(1)}"/>` +
    halo +
    `<text x="14" y="27" font-family="sans-serif" font-size="20" font-weight="bold" fill="${style.color}">${escapeXml(t(style.label))}</text>` +
    (corner
      ? `<text x="130" y="25" text-anchor="end" font-family="sans-serif" font-size="12" font-weight="bold" fill="#ffffffcc">${escapeXml(corner)}</text>`
      : "") +
    clawd(state, style.color, frame, seen, variant) +
    `<text x="72" y="128" text-anchor="middle" font-family="sans-serif" font-size="20" font-weight="bold" fill="#ffffff">${escapeXml(project)}</text>` +
    (model
      ? `<text x="72" y="139" text-anchor="middle" font-family="sans-serif" font-size="9.5" fill="#ffffff99">${escapeXml(model)}</text>`
      : "") +
    `</svg>`;

  return svgDataUri(svg);
}
