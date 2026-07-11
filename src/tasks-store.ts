import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fetchPendingIds } from "./util/reminders";

const DIR = join(homedir(), ".claude", "clawd-deck");
const FILE = join(DIR, "tasks.json");
const POLL_MS = 30 * 60 * 1000; // 30 min — Reminders query is ~30s, so poll gently
const KEEP_DAYS = 420;

interface TasksData {
  pendingTotal: number;
  done: Record<string, number>; // local date → tasks resolved that day
  lastPending: string[]; // last snapshot of pending IDs, for diffing
  ok: boolean; // did the last poll succeed (for UI state)
}

let _instance: TasksStore | null = null;
export function tasksStore(): TasksStore | null {
  return _instance;
}
export function setTasksStore(s: TasksStore): void {
  _instance = s;
}

/**
 * Tracks Apple Reminders productivity WITHOUT reading completion history (too slow
 * to query live). Every poll snapshots the set of pending reminder IDs; any ID that
 * left the pending set since last time counts as "resolved" (done) for today.
 * Forward-only: counting starts from first successful poll.
 */
export class TasksStore extends EventEmitter {
  private data: TasksData = { pendingTotal: 0, done: {}, lastPending: [], ok: false };
  private timer: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    await this.load();
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), POLL_MS);
  }
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async load(): Promise<void> {
    try {
      this.data = { ...this.data, ...(JSON.parse(await readFile(FILE, "utf8")) as TasksData) };
    } catch {
      /* first run */
    }
  }
  private async persist(): Promise<void> {
    try {
      await mkdir(DIR, { recursive: true });
      const done = Object.fromEntries(
        Object.entries(this.data.done).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, KEEP_DAYS),
      );
      this.data.done = done;
      await writeFile(FILE, JSON.stringify(this.data), "utf8");
    } catch {
      /* best-effort */
    }
  }

  private today(): string {
    return new Date().toLocaleDateString("en-CA");
  }

  async refresh(): Promise<void> {
    const ids = await fetchPendingIds();
    if (ids === null) {
      this.data.ok = false;
      this.emit("update");
      return; // keep last snapshot; do NOT diff against a failed read
    }
    const now = new Set(ids);
    let resolved = 0;
    for (const id of this.data.lastPending) if (!now.has(id)) resolved++;
    if (this.data.lastPending.length > 0 && resolved > 0) {
      const t = this.today();
      this.data.done[t] = (this.data.done[t] ?? 0) + resolved;
    }
    this.data.pendingTotal = ids.length;
    this.data.lastPending = ids;
    this.data.ok = true;
    await this.persist();
    this.emit("update");
  }

  // ---- queries ----
  ready(): boolean {
    return this.data.ok;
  }
  pendingTotal(): number {
    return this.data.pendingTotal;
  }
  doneToday(): number {
    return this.data.done[this.today()] ?? 0;
  }
  doneWeek(): number {
    const now = new Date();
    const dow = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
    mon.setHours(0, 0, 0, 0);
    let s = 0;
    for (const [d, c] of Object.entries(this.data.done)) {
      if (new Date(`${d}T12:00:00`) >= mon) s += c;
    }
    return s;
  }
  doneOn(dateISO: string): number {
    return this.data.done[dateISO] ?? 0;
  }
  doneMonth(): number {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let s = 0;
    for (const [d, c] of Object.entries(this.data.done)) if (d.startsWith(ym)) s += c;
    return s;
  }
  doneTotal(): number {
    let s = 0;
    for (const c of Object.values(this.data.done)) s += c;
    return s;
  }
  bestDoneDay(): number {
    let m = 0;
    for (const c of Object.values(this.data.done)) if (c > m) m = c;
    return m;
  }
}
