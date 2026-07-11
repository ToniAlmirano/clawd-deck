import { SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import type { SessionManager } from "../session-manager";

let _manager: SessionManager;

export function setManager(m: SessionManager): void {
  _manager = m;
}

// ---- shared animation ticker ----
let frame = 0;
let ticker: ReturnType<typeof setInterval> | null = null;
const animatedActions = new Set<ManagedAction>();

function ensureTicker(): void {
  if (ticker) return;
  ticker = setInterval(() => {
    frame = (frame + 1) % 1_000_000;
    for (const a of animatedActions) a.animate();
  }, 110); // ~9 fps
}

/** Current animation frame counter (advances while any animated action is visible). */
export function animFrame(): number {
  return frame;
}

/**
 * Base class for actions that observe SessionManager state.
 * Handles listener binding and triggers render() on session changes.
 * Set `animatedAction = true` to also re-render on the animation ticker.
 */
export abstract class ManagedAction extends SingletonAction {
  private listenersBound = false;
  protected animatedAction = false;

  protected get manager(): SessionManager {
    return _manager;
  }

  override onWillAppear(_ev: WillAppearEvent): void {
    if (!this.listenersBound && _manager) {
      _manager.on("sessionUpdated", () => this.render());
      _manager.on("activeSessionChanged", () => this.render());
      this.listenersBound = true;
    }
    if (this.animatedAction) {
      animatedActions.add(this);
      ensureTicker();
    }
    this.render();
  }

  override onWillDisappear(_ev: WillDisappearEvent): void {
    animatedActions.delete(this);
    if (animatedActions.size === 0 && ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  /** Called by the animation ticker — re-renders the current frame. */
  animate(): void {
    this.render();
  }

  protected abstract render(): void;
}
