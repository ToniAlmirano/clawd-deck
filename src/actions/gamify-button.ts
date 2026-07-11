import { action, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { activityStore } from "../activity-store";
import { tasksStore } from "../tasks-store";
import { iconTile } from "../util/icon-card";
import { ringTile } from "../util/ring-card";
import { t as tr } from "../util/i18n";

interface Coord {
  column: number;
  row: number;
}
const coords = new Map<string, Coord>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coordOf(a: any): Coord {
  return coords.get(a?.id) ?? a?.coordinates ?? { column: 99, row: 99 };
}

/**
 * Gamification row across 4 keys: RACHA (streak 🔥), TAREAS HOY (ring, done today),
 * RÉCORD (peak day 🏆), META HOY (ring, today vs personal record). All dynamic.
 */
@action({ UUID: "com.tonialmirano.clawddeck.gamify" })
export class GamifyButton extends SingletonAction {
  private bound = false;

  override onWillAppear(ev: WillAppearEvent): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (ev.action as any)?.coordinates;
    if (c) coords.set(ev.action.id, { column: c.column, row: c.row });
    if (!this.bound) {
      activityStore()?.on("update", () => this.render());
      tasksStore()?.on("update", () => this.render());
      this.bound = true;
    }
    this.render();
  }

  override onWillDisappear(ev: WillDisappearEvent): void {
    coords.delete(ev.action.id);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ordered(): any[] {
    return [...this.actions].sort((a, b) => {
      const ca = coordOf(a);
      const cb = coordOf(b);
      return ca.row - cb.row || ca.column - cb.column;
    });
  }

  private render(): void {
    const a = activityStore();
    const t = tasksStore();
    const record = a?.record() ?? 0;
    const streak = a?.streak() ?? 0;
    const today = a?.dayCount(new Date().toLocaleDateString("en-CA")) ?? 0;
    const metaHoy = record > 0 ? today / record : 0;
    const doneToday = t?.doneToday() ?? 0;
    const bestDone = Math.max(1, t?.bestDoneDay() ?? 0);

    const tiles = [
      () => iconTile({ emoji: "🔥", value: String(streak), label: tr("STREAK"), c1: "#ff7a18", c2: "#c23b0e" }),
      () => ringTile({ top: tr("TASKS TODAY"), big: String(doneToday), small: tr("done today"), pct: doneToday / bestDone, accent: "#3ff06b" }),
      () => iconTile({ emoji: "🏆", value: record.toLocaleString("en-US"), label: tr("RECORD"), c1: "#ffd23f", c2: "#e08a00", fg: "#3a2400" }),
      () => ringTile({ top: tr("TODAY'S GOAL"), big: `${Math.round(metaHoy * 100)}%`, small: tr("vs record"), pct: metaHoy, accent: "#3ff06b" }),
    ];
    this.ordered().forEach((act, i) => {
      act.setTitle("");
      act.setImage(tiles[i] ? tiles[i]() : ringTile({ top: "", big: "", small: "", pct: 0, accent: "#2a3345" }));
    });
  }
}
