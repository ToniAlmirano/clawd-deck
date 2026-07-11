import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// The Stream Deck runs the plugin from inside its own .sdPlugin folder, so the
// SDK's rolling logs are always at <cwd>/logs — portable across machines and
// plugin UUIDs (never hard-code a developer's home directory here).
const LOG_DIR = join(process.cwd(), "logs");
const LOG_FILE = /\.\d+\.log$/;
const LINE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})[.\d]*Z\s+INFO\s+Event:/;

/**
 * Count Claude Code activity per LOCAL date by parsing agentsd's own event logs.
 * Every hook the plugin receives is logged as `... INFO  Event: ...`, so the
 * per-day line count is a good proxy for "how much I worked in Claude Code".
 * Buckets by the machine's local timezone. Best-effort: empty map on failure.
 */
export async function activityByLocalDate(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let files: string[];
  try {
    files = (await readdir(LOG_DIR)).filter((f) => LOG_FILE.test(f));
  } catch {
    return counts;
  }
  for (const f of files) {
    let text: string;
    try {
      text = await readFile(join(LOG_DIR, f), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const m = LINE.exec(line);
      if (!m) continue;
      const localDate = new Date(`${m[1]}Z`).toLocaleDateString("en-CA"); // YYYY-MM-DD, local tz
      counts.set(localDate, (counts.get(localDate) ?? 0) + 1);
    }
  }
  return counts;
}
