import { execFile } from "node:child_process";

/**
 * Resolve the user's manual tab rename for each terminal from iTerm2.
 *
 * When you "Edit Tab Title…" in iTerm2 it sets `tab.titleOverride`, which is
 * independent of the title Claude Code writes (that goes to `session.name` /
 * `session.autoName`). So this gives us exactly "what the user named the tab",
 * keyed by tty (e.g. "/dev/ttys001"). Sessions with no override are omitted.
 *
 * Never launches iTerm2: bails if it isn't already running. Resolves to an
 * empty map on any failure (no iTerm, no Automation permission, etc.).
 */
export function itermTitleOverrides(): Promise<Map<string, string>> {
  return new Promise((resolve) => {
    execFile("pgrep", ["-x", "iTerm2"], (notRunning) => {
      if (notRunning) {
        resolve(new Map());
        return;
      }
      const osa =
        `tell application "iTerm2"\n` +
        `  set out to ""\n` +
        `  repeat with w in windows\n` +
        `    repeat with t in tabs of w\n` +
        `      repeat with s in sessions of t\n` +
        `        try\n` +
        `          tell s to set ov to (variable named "tab.titleOverride")\n` +
        `          set out to out & (tty of s) & character id 9 & ov & linefeed\n` +
        `        end try\n` +
        `      end repeat\n` +
        `    end repeat\n` +
        `  end repeat\n` +
        `  return out\n` +
        `end tell`;
      execFile("osascript", ["-e", osa], (err, stdout) => {
        const map = new Map<string, string>();
        if (err || !stdout) {
          resolve(map);
          return;
        }
        for (const line of stdout.split("\n")) {
          const tab = line.indexOf("\t");
          if (tab < 0) continue;
          const tty = line.slice(0, tab).trim();
          const ov = line.slice(tab + 1).trim();
          // The `try` above skips missing values, but guard anyway.
          if (tty && ov && ov !== "missing value") map.set(tty, ov);
        }
        resolve(map);
      });
    });
  });
}

/** Map pid → controlling tty ("/dev/ttysNNN") for the given pids, via one ps call. */
export function ttysForPids(pids: number[]): Promise<Map<number, string>> {
  return new Promise((resolve) => {
    const map = new Map<number, string>();
    if (pids.length === 0) {
      resolve(map);
      return;
    }
    execFile("ps", ["-o", "pid=,tty=", "-p", pids.join(",")], (err, stdout) => {
      if (err || !stdout) {
        resolve(map);
        return;
      }
      for (const line of stdout.trim().split("\n")) {
        const m = line.trim().match(/^(\d+)\s+(\S+)$/);
        if (!m) continue;
        const pid = Number.parseInt(m[1], 10);
        let tty = m[2];
        if (tty.includes("?")) continue; // no controlling terminal
        if (!tty.startsWith("/dev/")) tty = `/dev/${tty}`;
        map.set(pid, tty);
      }
      resolve(map);
    });
  });
}
