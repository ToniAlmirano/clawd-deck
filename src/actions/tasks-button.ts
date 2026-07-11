import { action, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { tasksStore } from "../tasks-store";
import { totalTile } from "../util/total-card";
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

const TILES: { label: string; accent: string; kind: "pending" | "today" | "week" }[] = [
  { label: "TO DO", accent: "#f2b545", kind: "pending" },
  { label: "DONE TODAY", accent: "#3ff06b", kind: "today" },
  { label: "DONE WEEK", accent: "#4aa3ff", kind: "week" },
];

/**
 * Reminders "effort" tiles across N keys (intended: 3 = pending / done-today /
 * done-this-week). Values come from the background TasksStore (never queried on
 * this UI path). Shows "—" with a hint until the first successful Reminders read.
 */
@action({ UUID: "com.tonialmirano.clawddeck.tasks" })
export class TasksButton extends SingletonAction {
  private bound = false;

  override onWillAppear(ev: WillAppearEvent): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (ev.action as any)?.coordinates;
    if (c) coords.set(ev.action.id, { column: c.column, row: c.row });
    if (!this.bound) {
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
    const store = tasksStore();
    const ready = store?.ready() ?? false;
    this.ordered().forEach((act, i) => {
      act.setTitle("");
      const t = TILES[i];
      if (!t) {
        act.setImage(totalTile({ label: "", value: 0, accent: "#2a3345" }));
        return;
      }
      if (!store || !ready) {
        act.setImage(totalTile({ label: tr(t.label), value: 0, accent: t.accent, note: tr("activating…") }));
        return;
      }
      const value = t.kind === "pending" ? store.pendingTotal() : t.kind === "today" ? store.doneToday() : store.doneWeek();
      act.setImage(totalTile({ label: tr(t.label), value, accent: t.accent }));
    });
  }
}
