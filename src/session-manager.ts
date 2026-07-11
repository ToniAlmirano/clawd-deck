import { EventEmitter } from "node:events";
import streamDeck from "@elgato/streamdeck";
import { transition } from "./state-machine";
import type { HookEventName, HookPayload, PendingPermission, SessionSnapshot, SessionState } from "./types";
import { State } from "./types";
import { extractModel } from "./util/transcript";
import { itermTitleOverrides, ttysForPids } from "./util/iterm-title";

/**
 * Persisted board: sessions are never removed. An idle slot with no activity for
 * this long fades to OFFLINE (kept on the board, project stays visible) — a safety
 * net for a missed SessionEnd. Real ends come via the SessionEnd hook.
 */
const STALE_MS = 30 * 60 * 1000;
/** Sessions untouched (no hook events) for this long are removed from the board entirely. */
const REMOVE_MS = 2 * 60 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 1000;
/** How often to re-read iTerm2 tab renames (tab.titleOverride) onto sessions. */
const TITLE_REFRESH_MS = 8 * 1000;

/** True if a process with this PID is still running (EPERM = exists but not ours). */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export class SessionManager extends EventEmitter {
  private readonly sessions = new Map<string, SessionState>();
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private titleTimer: ReturnType<typeof setInterval> | null = null;
  private _activeIndex = 0;
  /** Session IDs with pending permissions, ordered by arrival. */
  private permissionQueue: string[] = [];

  constructor() {
    super();
    // 7 managed actions × 2 events + headroom
    this.setMaxListeners(20);
  }

  start(): void {
    this.pruneTimer = setInterval(() => this.pruneStale(), PRUNE_INTERVAL_MS);
    this.titleTimer = setInterval(() => void this.refreshITermTitles(), TITLE_REFRESH_MS);
    void this.refreshITermTitles();
  }

  stop(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    if (this.titleTimer) {
      clearInterval(this.titleTimer);
      this.titleTimer = null;
    }
    for (const session of this.sessions.values()) {
      this.clearPendingPermission(session);
    }
    this.sessions.clear();
  }

  get activeSession(): SessionState | undefined {
    const ids = [...this.sessions.keys()];
    if (ids.length === 0) return undefined;
    this._activeIndex = Math.min(this._activeIndex, ids.length - 1);
    return this.sessions.get(ids[this._activeIndex]);
  }

  get activeIndex(): number {
    return this._activeIndex;
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Sessions ordered for the board: the ones that need attention or are active
   * float to the top (always visible), OFFLINE sinks to the bottom (overflows
   * off-screen if there are more sessions than keys). Stable within each rank,
   * so cards only move when a session's state actually changes.
   */
  get orderedSessions(): SessionState[] {
    const rank = (s: SessionState): number => {
      const needsYou =
        s.state === State.IDLE ||
        s.state === State.AWAITING_PERMISSION ||
        s.state === State.AWAITING_ELICITATION;
      // Seen but still waiting for your input → "PENDIENTE", below the working ones.
      if (needsYou && s.acknowledged) return 3;
      switch (s.state) {
        case State.AWAITING_PERMISSION:
        case State.AWAITING_ELICITATION:
          return 0; // PREGUNTA/PERMISO (unseen) — needs you now
        case State.IDLE:
          return 1; // TU TURNO (unseen) — done, waiting for you
        case State.PROCESSING:
          return 2; // working — always visible above seen/offline
        default:
          return 4; // OFFLINE — last
      }
    };
    return [...this.sessions.values()].sort((a, b) => rank(a) - rank(b));
  }

  /**
   * Serializable per-session view for the /debug/sessions endpoint and tests.
   * Drops PendingPermission's req/res/timer, which are not JSON-safe.
   */
  getSnapshot(): SessionSnapshot[] {
    return [...this.sessions.values()].map((s) => ({
      id: s.id,
      state: s.state,
      cwd: s.cwd,
      permissionMode: s.permissionMode,
      currentTool: s.currentTool,
      activeWork: s.activeWork,
      lastError: s.lastError,
      model: s.model,
      pid: s.pid,
      lastActivity: s.lastActivity,
      hasPendingPermission: !!s.pendingPermission,
      pendingPermissionToolName: s.pendingPermission?.toolName ?? null,
    }));
  }

  cycleSession(direction: number): SessionState | undefined {
    const count = this.sessions.size;
    if (count === 0) return undefined;
    this._activeIndex = ((this._activeIndex + direction) % count + count) % count;
    const session = this.activeSession;
    this.emit("activeSessionChanged", session);
    return session;
  }

  /** Mark a session as seen (user clicked its key) — moves TU TURNO/PREGUNTA → PENDIENTE. */
  acknowledgeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.acknowledged) return;
    session.acknowledged = true;
    this.emit("sessionUpdated", session, "Notification");
  }

  handleEvent(event: HookEventName, payload: HookPayload): SessionState | undefined {
    const id = payload.session_id;
    if (!id) return undefined;

    let session = this.sessions.get(id);

    // Persisted board: a new session for a project that already has an OFFLINE slot
    // revives that slot in place (same position) instead of adding a duplicate.
    if (!session && payload.cwd && payload.cwd !== "unknown") {
      for (const [oldId, s] of this.sessions) {
        if (s.cwd === payload.cwd && s.state === State.DISCONNECTED) {
          s.id = id;
          s.state = State.IDLE;
          s.acknowledged = false;
          s.activeWork = 0;
          s.lastError = null;
          s.currentTool = null;
          const entries = [...this.sessions.entries()];
          this.sessions.clear();
          for (const [k, v] of entries) this.sessions.set(k === oldId ? id : k, v);
          session = s;
          break;
        }
      }
    }

    if (!session) {
      // Auto-create session on any event (handles missed SessionStart or plugin restart).
      // Starts as IDLE (not DISCONNECTED) so subsequent tool events can transition normally.
      session = {
        id,
        state: State.IDLE,
        cwd: payload.cwd ?? "unknown",
        customTitle: null,
        acknowledged: false,
        permissionMode: payload.permission_mode ?? "default",
        currentTool: null,
        activeWork: 0,
        lastError: null,
        model: payload.model ?? null,
        pendingPermission: null,
        pid: null,
        lastActivity: Date.now(),
      };
      this.sessions.set(id, session);

      // Backfill model from transcript if not in payload
      if (!session.model && payload.transcript_path) {
        extractModel(payload.transcript_path).then((model) => {
          const s = this.sessions.get(id);
          if (model && s && !s.model) {
            s.model = model;
            this.emit("sessionUpdated", s, event);
          }
        });
      }
    }

    session.lastActivity = Date.now();
    if (payload.model) session.model = payload.model;

    // Apply state transition
    const prevState = session.state;
    let nextState = transition(session.state, event);

    // Guard: suppress transitions away from AWAITING_PERMISSION when a plugin-held
    // permission is pending. Parallel tool events (PreToolUse, PostToolUse, etc.)
    // must not kick the session out of AWAITING_PERMISSION and auto-deny.
    if (
      session.pendingPermission &&
      prevState === State.AWAITING_PERMISSION &&
      nextState !== null &&
      nextState !== State.AWAITING_PERMISSION &&
      event !== "PermissionRequest" &&
      event !== "Stop" &&
      event !== "SessionEnd"
    ) {
      nextState = null;
    }

    if (nextState !== null) {
      // Clear error indicator when leaving IDLE
      if (prevState === State.IDLE && nextState !== State.IDLE) {
        session.lastError = null;
      }
      session.state = nextState;
    }

    // A session that starts working again is a fresh cycle — clear "seen" so its
    // next TU TURNO / PREGUNTA grabs your attention again.
    if (session.state === State.PROCESSING) session.acknowledged = false;

    streamDeck.logger.info(`Event: ${event} session=${id} prev=${prevState} next=${session.state} hasPending=${!!session.pendingPermission} pid=${session.pid}`);

    // If we left AWAITING_PERMISSION via a non-resolution path (e.g. user approved
    // in terminal), clean up the stale pending permission and its timeout.
    if (prevState === State.AWAITING_PERMISSION && session.state !== State.AWAITING_PERMISSION && session.pendingPermission) {
      streamDeck.logger.info(`Clearing stale pending permission for session=${id} (transitioned away via ${event})`);
      this.clearPendingPermission(session);
    }

    // Auto-foreground sessions needing user attention
    if (event === "Elicitation") {
      this.focusSession(id);
    }

    // Event-specific side effects
    switch (event) {
      case "PreToolUse":
        session.currentTool = payload.tool_name ?? null;
        break;
      case "PostToolUse":
        session.currentTool = null;
        break;
      case "PostToolUseFailure":
        session.currentTool = null;
        session.lastError = payload.error ?? "Tool failed";
        break;
      case "SubagentStart":
      case "TaskCreated":
        session.activeWork++;
        break;
      case "SubagentStop":
      case "TaskCompleted":
        session.activeWork = Math.max(0, session.activeWork - 1);
        break;
      case "Stop":
        session.currentTool = null;
        break;
      case "StopFailure":
        session.currentTool = null;
        session.lastError = payload.error ?? "Agent stopped due to error";
        break;
      case "SessionEnd":
        this.clearPendingPermission(session);
        // Persisted board: keep the slot as OFFLINE so the project stays visible.
        session.state = State.DISCONNECTED;
        session.currentTool = null;
        session.activeWork = 0;
        this.emit("sessionUpdated", session, event);
        return session;
    }

    // Notify when an agent needs you: finished its turn (your turn) or asked a question.
    if (prevState === State.PROCESSING && session.state === State.IDLE) {
      this.emit("attention", session, "done");
    } else if (session.state === State.AWAITING_ELICITATION && prevState !== State.AWAITING_ELICITATION) {
      this.emit("attention", session, "ask");
    }

    this.emit("sessionUpdated", session, event);
    return session;
  }

  /** Store the resolved PID for a session. Updated on every hook event to stay fresh. */
  setSessionPid(sessionId: string, pid: number): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.pid = pid;
    }
  }

  /** Send SIGINT to the active session's Claude Code process. Returns true if signal was sent. */
  interruptActiveSession(): boolean {
    const session = this.activeSession;
    if (!session?.pid) return false;
    if (session.state === State.DISCONNECTED || session.state === State.IDLE) return false;
    try {
      process.kill(session.pid, "SIGINT");
      return true;
    } catch {
      return false;
    }
  }

  /** Bring a session to the foreground by ID. */
  focusSession(sessionId: string): void {
    const ids = [...this.sessions.keys()];
    const idx = ids.indexOf(sessionId);
    if (idx >= 0 && idx !== this._activeIndex) {
      this._activeIndex = idx;
      this.emit("activeSessionChanged", this.activeSession);
    }
  }

  setPendingPermission(sessionId: string, pending: PendingPermission): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.clearPendingPermission(session);
    session.pendingPermission = pending;
    if (!this.permissionQueue.includes(sessionId)) {
      this.permissionQueue.push(sessionId);
    }
    // Only auto-foreground if this is the first (or only) queued permission
    if (this.permissionQueue[0] === sessionId) {
      this.focusSession(sessionId);
    }
    this.emit("sessionUpdated", session, "PermissionRequest");
  }

  /**
   * Clear pending permission state without writing the HTTP response.
   * Used by the timeout handler in HookServer (which writes its own response).
   */
  clearPendingPermissionById(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session?.pendingPermission) return;
    clearTimeout(session.pendingPermission.timer);
    session.pendingPermission = null;
    session.state = State.PROCESSING;
    this.removeFromPermissionQueue(sessionId);
    this.emit("sessionUpdated", session, "PermissionRequest");
    this.advancePermissionQueue();
  }

  resolvePermissionAlwaysAllow(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session?.pendingPermission) return false;

    const { res, timer, toolName } = session.pendingPermission;
    clearTimeout(timer);

    if (!res.writableEnded) {
      const body = {
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: {
            behavior: "allow",
            updatedPermissions: [{
              type: "addRules",
              rules: [{ toolName: toolName ?? "*", ruleContent: "*" }],
              behavior: "allow",
              destination: "session",
            }],
          },
        },
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    }

    session.pendingPermission = null;
    session.state = State.PROCESSING;
    this.removeFromPermissionQueue(sessionId);
    this.emit("sessionUpdated", session, "PermissionRequest");
    this.advancePermissionQueue();
    return true;
  }

  resolvePermission(sessionId: string, allow: boolean, reason?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session?.pendingPermission) return false;

    const { res, timer } = session.pendingPermission;
    clearTimeout(timer);

    if (!res.writableEnded) {
      const body = allow
        ? { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } } }
        : { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: reason ?? "Denied via Stream Deck" } } };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    }

    session.pendingPermission = null;
    // Agent continues processing after permission resolution
    session.state = State.PROCESSING;
    this.removeFromPermissionQueue(sessionId);
    this.emit("sessionUpdated", session, "PermissionRequest");
    this.advancePermissionQueue();
    return true;
  }

  private clearPendingPermission(session: SessionState): void {
    if (!session.pendingPermission) return;
    this.removeFromPermissionQueue(session.id);
    clearTimeout(session.pendingPermission.timer);
    try {
      if (!session.pendingPermission.res.writableEnded) {
        const body = { hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "deny", message: "Session ended" } } };
        session.pendingPermission.res.writeHead(200, { "Content-Type": "application/json" });
        session.pendingPermission.res.end(JSON.stringify(body));
      }
    } catch (err) {
      streamDeck.logger.warn(`Failed to write deny response for session=${session.id}: ${err}`);
    }
    session.pendingPermission = null;
  }

  private removeFromPermissionQueue(sessionId: string): void {
    const idx = this.permissionQueue.indexOf(sessionId);
    if (idx >= 0) this.permissionQueue.splice(idx, 1);
  }

  private advancePermissionQueue(): void {
    if (this.permissionQueue.length > 0) {
      const nextId = this.permissionQueue[0];
      this.focusSession(nextId);
      const next = this.sessions.get(nextId);
      if (next) this.emit("sessionUpdated", next, "PermissionRequest");
    }
  }

  private clampActiveIndex(): void {
    const count = this.sessions.size;
    if (count === 0) {
      this._activeIndex = 0;
    } else {
      this._activeIndex = Math.min(this._activeIndex, count - 1);
    }
  }

  /**
   * Re-read iTerm2 tab renames (tab.titleOverride) and apply them to sessions,
   * matched by each agent PID's tty. A renamed tab shows that name on the deck;
   * clearing the rename falls back to the project folder name. Best-effort: a no-op
   * when iTerm2 isn't running or Automation permission is denied.
   */
  async refreshITermTitles(): Promise<void> {
    const withPid = [...this.sessions.values()].filter((s) => s.pid != null);
    if (withPid.length === 0) return;
    const [ttyByPid, overrideByTty] = await Promise.all([
      ttysForPids(withPid.map((s) => s.pid as number)),
      itermTitleOverrides(),
    ]);
    for (const s of withPid) {
      const tty = ttyByPid.get(s.pid as number);
      const next = (tty && overrideByTty.get(tty)) || null;
      if (next !== s.customTitle) {
        s.customTitle = next;
        this.emit("sessionUpdated", s, "Notification");
      }
    }
  }

  private pruneStale(): void {
    const now = Date.now();
    const remove: string[] = [];
    for (const [id, session] of this.sessions) {
      // Cleanup: a session untouched for >2h is gone from the board entirely
      // (users re-invoke what they need; stale slots just clutter).
      if (now - session.lastActivity > REMOVE_MS) {
        remove.push(id);
        continue;
      }
      // Fade a finished (idle) session to OFFLINE once its process is actually gone.
      // A live-but-idle session (waiting on the user) must stay visible, not gray out.
      if (session.state === State.IDLE && now - session.lastActivity > STALE_MS) {
        if (session.pid && isProcessAlive(session.pid)) continue;
        this.clearPendingPermission(session);
        session.state = State.DISCONNECTED;
        session.currentTool = null;
        session.activeWork = 0;
        this.emit("sessionUpdated", session, "Stop");
      }
    }
    for (const id of remove) {
      const s = this.sessions.get(id);
      if (!s) continue;
      this.clearPendingPermission(s);
      this.emit("sessionUpdated", s, "SessionEnd");
      this.sessions.delete(id);
    }
  }
}
