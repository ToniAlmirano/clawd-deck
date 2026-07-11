import { EventEmitter } from "node:events";
import streamDeck from "@elgato/streamdeck";
import { fetchUsage, type UsageData } from "./util/usage";

// Conservative: the usage endpoint 429s on frequent polls, and the data only
// moves slowly. 2 minutes is plenty for a glanceable gauge.
const POLL_MS = 120 * 1000;

let _instance: UsageMonitor | null = null;
/** Shared accessor so actions can read usage without dependency injection plumbing. */
export function usageMonitor(): UsageMonitor | null {
  return _instance;
}
export function setUsageMonitor(m: UsageMonitor): void {
  _instance = m;
}

/**
 * Polls Claude usage (5h session + weekly) on an interval and emits "update".
 * Best-effort: a failed fetch keeps the last known value rather than blanking.
 */
export class UsageMonitor extends EventEmitter {
  latest: UsageData | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async poll(): Promise<void> {
    const data = await fetchUsage();
    if (data) {
      this.latest = data;
      this.emit("update", data);
      streamDeck.logger.info(
        `Usage: session=${data.session?.percent ?? "?"}% weekly=${data.weekly?.percent ?? "?"}% ${data.scoped?.modelName ?? "scoped"}=${data.scoped?.percent ?? "?"}%`,
      );
    } else {
      streamDeck.logger.info("Usage: fetch failed (sin token / prompt de Keychain / 429)");
    }
  }
}
