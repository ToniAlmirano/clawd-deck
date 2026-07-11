import { action, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { execFile } from "node:child_process";
import { ManagedAction, animFrame } from "./base";
import { sessionCardImage } from "../util/card";

interface Coord {
  column: number;
  row: number;
}

// Physical key coordinates per visible action instance, used to order the
// "session slots" top-left → bottom-right so active sessions auto-fill them.
const coords = new Map<string, Coord>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coordOf(a: any): Coord {
  return coords.get(a?.id) ?? a?.coordinates ?? { column: 99, row: 99 };
}

/**
 * Jump to the exact iTerm2 tab running this Claude session, matched by TTY
 * (the agent's PID → its tty → the iTerm2 session with that tty). Falls back to
 * just foregrounding iTerm if there's no PID/tty match.
 */
function jumpToITerm(pid: number | null): void {
  if (!pid) {
    execFile("open", ["-a", "iTerm"], () => {});
    return;
  }
  execFile("ps", ["-o", "tty=", "-p", String(pid)], (_err, stdout) => {
    const tty = (stdout || "").trim();
    if (!tty || tty.includes("?")) {
      execFile("open", ["-a", "iTerm"], () => {});
      return;
    }
    const target = tty.startsWith("/dev/") ? tty : `/dev/${tty}`;
    const osa =
      `tell application "iTerm2"\n` +
      `  activate\n` +
      `  repeat with w in windows\n` +
      `    repeat with t in tabs of w\n` +
      `      repeat with s in sessions of t\n` +
      `        try\n` +
      `          if (tty of s) is "${target}" then\n` +
      `            tell t to select\n` +
      `            return\n` +
      `          end if\n` +
      `        end try\n` +
      `      end repeat\n` +
      `    end repeat\n` +
      `  end repeat\n` +
      `end tell`;
    execFile("osascript", ["-e", osa], () => {});
  });
}

@action({ UUID: "com.tonialmirano.clawddeck.session" })
export class SessionButton extends ManagedAction {
  protected override animatedAction = true;

  override onWillAppear(ev: WillAppearEvent): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (ev.action as any)?.coordinates;
    if (c) coords.set(ev.action.id, { column: c.column, row: c.row });
    super.onWillAppear(ev);
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    coords.delete(ev.action.id);
    super.onWillDisappear(ev);
  }

  override onKeyDown(ev: KeyDownEvent): void {
    const slot = this.orderedActions().findIndex((a) => a.id === ev.action.id);
    const session = this.manager?.orderedSessions[slot];
    if (!session) return;
    this.manager?.acknowledgeSession(session.id); // "ya lo vi" → TU TURNO/PREGUNTA baja a PENDIENTE
    this.manager?.focusSession(session.id);
    jumpToITerm(session.pid);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private orderedActions(): any[] {
    return [...this.actions].sort((a, b) => {
      const ca = coordOf(a);
      const cb = coordOf(b);
      return ca.row - cb.row || ca.column - cb.column;
    });
  }

  protected render(): void {
    const sessions = this.manager?.orderedSessions ?? [];
    const frame = animFrame();
    this.orderedActions().forEach((act, slot) => {
      const session = sessions[slot] ?? null;
      act.setTitle("");
      act.setImage(sessionCardImage(session, 1, slot, frame));
    });
  }
}
