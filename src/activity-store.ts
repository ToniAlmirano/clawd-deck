import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { activityByLocalDate } from "./util/activity";

const STORE_DIR = join(homedir(), ".claude", "clawd-deck");
const STORE_FILE = join(STORE_DIR, "activity.json");
const REFRESH_MS = 60 * 1000;
const KEEP_DAYS = 420;

let _instance: ActivityStore | null = null;
export function activityStore(): ActivityStore | null {
  return _instance;
}
export function setActivityStore(s: ActivityStore): void {
  _instance = s;
}

/**
 * Persistent per-day activity counts (local dates → event count). The agentsd
 * logs only hold ~2 weeks, so we merge them into a durable JSON store on disk so
 * month/year totals survive log rotation. A day's count only grows, so we keep the
 * max between the archive and what the logs currently report.
 */
export class ActivityStore extends EventEmitter {
  counts = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
  }
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async load(): Promise<Map<string, number>> {
    try {
      const obj = JSON.parse(await readFile(STORE_FILE, "utf8")) as Record<string, number>;
      return new Map(Object.entries(obj));
    } catch {
      return new Map();
    }
  }

  private async persist(m: Map<string, number>): Promise<void> {
    try {
      await mkdir(STORE_DIR, { recursive: true });
      const entries = [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, KEEP_DAYS);
      await writeFile(STORE_FILE, JSON.stringify(Object.fromEntries(entries)), "utf8");
    } catch {
      /* best-effort */
    }
  }

  async refresh(): Promise<void> {
    const merged = await this.load();
    const fromLogs = await activityByLocalDate();
    for (const [date, c] of fromLogs) merged.set(date, Math.max(merged.get(date) ?? 0, c));
    this.counts = merged;
    await this.persist(merged);
    this.emit("update");
  }

  // ---- queries (all local-date based) ----
  hasData(): boolean {
    return this.counts.size > 0;
  }
  dayCount(dateISO: string): number {
    return this.counts.get(dateISO) ?? 0;
  }
  firstDate(): string | null {
    return this.counts.size ? [...this.counts.keys()].sort()[0] : null;
  }
  private sumBetween(from: Date, to: Date): number {
    let s = 0;
    for (const [d, c] of this.counts) {
      const dd = new Date(`${d}T12:00:00`);
      if (dd >= from && dd <= to) s += c;
    }
    return s;
  }
  weekTotal(): number {
    const now = new Date();
    const dow = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
    mon.setHours(0, 0, 0, 0);
    return this.sumBetween(mon, now);
  }
  monthTotal(): number {
    const now = new Date();
    return this.sumBetween(new Date(now.getFullYear(), now.getMonth(), 1), now);
  }
  yearTotal(): number {
    const now = new Date();
    return this.sumBetween(new Date(now.getFullYear(), 0, 1), now);
  }
  record(): number {
    let m = 0;
    for (const c of this.counts.values()) if (c > m) m = c;
    return m;
  }
  streak(): number {
    const iso = (d: Date) => d.toLocaleDateString("en-CA");
    const day = new Date();
    if ((this.counts.get(iso(day)) ?? 0) === 0) day.setDate(day.getDate() - 1); // grace: today not started
    let s = 0;
    while ((this.counts.get(iso(day)) ?? 0) > 0) {
      s++;
      day.setDate(day.getDate() - 1);
    }
    return s;
  }
  private bucketMax(keyOf: (d: Date) => string): number {
    const agg = new Map<string, number>();
    for (const [d, c] of this.counts) {
      const k = keyOf(new Date(`${d}T12:00:00`));
      agg.set(k, (agg.get(k) ?? 0) + c);
    }
    let m = 0;
    for (const v of agg.values()) if (v > m) m = v;
    return m;
  }
  bestWeek(): number {
    return this.bucketMax((d) => {
      const mon = new Date(d);
      mon.setDate(d.getDate() + (d.getDay() === 0 ? -6 : 1 - d.getDay()));
      return mon.toLocaleDateString("en-CA");
    });
  }
  bestMonth(): number {
    return this.bucketMax((d) => `${d.getFullYear()}-${d.getMonth()}`);
  }
}
