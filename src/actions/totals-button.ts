import { action, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { activityStore } from "../activity-store";
import { tasksStore } from "../tasks-store";
import { barTile } from "../util/bar-card";
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
 * Period tiles across 3 keys: SEMANA (bar vs best week), MES (bar vs best month),
 * NIVEL (ring, XP from code events + tasks). Progress is dynamic — relative to the
 * user's own personal bests, no fixed goals.
 */
@action({ UUID: "com.tonialmirano.clawddeck.period-totals" })
export class PeriodTotalsButton extends SingletonAction {
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
    const week = a?.weekTotal() ?? 0;
    const month = a?.monthTotal() ?? 0;
    const year = a?.yearTotal() ?? 0;
    const bestW = Math.max(1, a?.bestWeek() ?? 0);
    const bestM = Math.max(1, a?.bestMonth() ?? 0);
    const xp = year + (t?.doneTotal() ?? 0) * 100; // 1 tarea = 100 XP (código+tareas)
    const level = Math.floor(xp / 3000);
    const lvlPct = (xp % 3000) / 3000;

    const tiles = [
      () => barTile({ label: tr("WEEK"), value: week.toLocaleString("en-US"), sub: `+${t?.doneWeek() ?? 0} ${tr("TASKS")} ✓`, pct: week / bestW, accent: "#3ff06b" }),
      () => barTile({ label: tr("MONTH"), value: month.toLocaleString("en-US"), sub: `+${t?.doneMonth() ?? 0} ${tr("TASKS")} ✓`, pct: month / bestM, accent: "#4aa3ff" }),
      () => ringTile({ top: tr("LEVEL"), big: `${tr("LVL")} ${level}`, small: tr("code+tasks"), pct: lvlPct, accent: "#ff8a3d" }),
    ];
    this.ordered().forEach((act, i) => {
      act.setTitle("");
      act.setImage(tiles[i] ? tiles[i]() : ringTile({ top: "", big: "", small: "", pct: 0, accent: "#2a3345" }));
    });
  }
}
