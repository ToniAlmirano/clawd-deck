import { execFile } from "node:child_process";

// Bulk-fetch the IDs of all incomplete reminders in one Apple Event (~30s, so
// this must only run in a background poll, never on a UI refresh path).
const AS_PENDING = `
tell application "Reminders"
  set ids to id of (reminders whose completed is false)
end tell
set AppleScript's text item delimiters to linefeed
return ids as text`;

/**
 * Returns the list of pending reminder IDs, or `null` on error/timeout/TCC denial.
 * Null (not empty) is important: callers must NOT treat a failure as "0 pending"
 * or the completion diff would count every task as done.
 */
export function fetchPendingIds(): Promise<string[] | null> {
  return new Promise((resolve) => {
    execFile(
      "osascript",
      ["-e", AS_PENDING],
      { timeout: 90_000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        resolve(
          stdout
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        );
      },
    );
  });
}
