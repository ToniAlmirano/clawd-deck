import { execFile } from "node:child_process";

export interface UsageWindow {
  /** 0–100 percent of the limit used. */
  percent: number;
  /** ISO timestamp when the window resets, or null. */
  resetsAt: string | null;
}

/** A weekly limit scoped to one model (today: "Fable"). Only present in limits[]. */
export interface ScopedUsage extends UsageWindow {
  /** Display name of the model, e.g. "Fable". */
  modelName: string;
}

export interface UsageData {
  session: UsageWindow | null; // five_hour rolling window
  weekly: UsageWindow | null; // seven_day window
  /** Model-scoped weekly limit (kind "weekly_scoped"), e.g. Fable. */
  scoped: ScopedUsage | null;
  subscriptionType: string | null;
  fetchedAt: number;
}

/**
 * Read the Claude Code OAuth access token from the macOS Keychain
 * (item "Claude Code-credentials"). Returns null on any failure. The token is
 * never logged. macOS may prompt for Keychain access the first time — choose
 * "Always Allow" so background polling is silent afterwards.
 */
function readOAuthToken(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve(null);
          return;
        }
        try {
          const d = JSON.parse(stdout);
          const c = d.claudeAiOauth ?? d;
          resolve(typeof c?.accessToken === "string" ? c.accessToken : null);
        } catch {
          resolve(null);
        }
      },
    );
  });
}

/**
 * Fetch current usage from the same endpoint Claude Code's /usage uses.
 * Uses the local Claude Code OAuth token (needs `user:profile` scope, which the
 * Claude Code token has). Independent of any menu-bar app and of claude.ai cookies.
 */
export async function fetchUsage(): Promise<UsageData | null> {
  const token = await readOAuthToken();
  if (!token) return null;
  try {
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    const win = (o: unknown): UsageWindow | null => {
      const w = o as { utilization?: unknown; resets_at?: unknown } | null;
      return w && typeof w.utilization === "number"
        ? { percent: Math.round(w.utilization), resetsAt: typeof w.resets_at === "string" ? w.resets_at : null }
        : null;
    };
    // The per-model weekly limit (Fable) exists ONLY inside limits[] — the
    // top-level seven_day_opus / seven_day_sonnet fields come back null.
    const limits = Array.isArray(j.limits) ? (j.limits as Array<Record<string, unknown>>) : [];
    const sc = limits.find((l) => l.kind === "weekly_scoped" && typeof l.percent === "number");
    const scopeName = (sc?.scope as { model?: { display_name?: unknown } } | undefined)?.model?.display_name;
    const scoped: ScopedUsage | null = sc
      ? {
          percent: Math.round(sc.percent as number),
          resetsAt: typeof sc.resets_at === "string" ? sc.resets_at : null,
          modelName: typeof scopeName === "string" && scopeName ? scopeName : "Fable",
        }
      : null;

    return {
      session: win(j.five_hour),
      weekly: win(j.seven_day),
      scoped,
      subscriptionType: typeof j.subscriptionType === "string" ? j.subscriptionType : null,
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}
