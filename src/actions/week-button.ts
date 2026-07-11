import { action, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { activityStore } from "../activity-store";
import { tasksStore } from "../tasks-store";
import { heatmapTile } from "../util/heatmap-card";
import { t } from "../util/i18n";

interface Coord {
  column: number;
  row: number;
}
const coords = new Map<string, Coord>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coordOf(a: any): Coord {
  return coords.get(a?.id) ?? a?.coordinates ?? { column: 99, row: 99 };
}

const LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(t);

/** Local dates (YYYY-MM-DD) for Mon…Sun of the current week, plus today flag. */
function weekDays(): { date: string; label: string; isToday: boolean }[] {
  const now = new Date();
  const today = now.toLocaleDateString("en-CA");
  const dow = now.getDay(); // 0=Sun … 6=Sat (local)
  const monday = new Date(now);
  monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
  return LABELS.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const date = d.toLocaleDateString("en-CA");
    return { date, label, isToday: date === today };
  });
}

/**
 * Weekly activity heatmap spread across N keys (intended: 7 = Mon–Sun). Each key
 * shows one day's Claude Code activity, shaded GitHub-style by relative volume.
 */
@action({ UUID: "com.tonialmirano.clawddeck.week-heatmap" })
export class WeekHeatmapButton extends SingletonAction {
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
    const store = activityStore();
    const days = weekDays();
    const hasData = store?.hasData() ?? false;
    const max = Math.max(1, ...days.map((d) => store?.dayCount(d.date) ?? 0));
    this.ordered().forEach((act, i) => {
      act.setTitle("");
      const day = days[i];
      if (!day) {
        act.setImage(heatmapTile({ label: "", count: 0, max, isToday: false, noData: true, done: 0 }));
        return;
      }
      act.setImage(
        heatmapTile({
          label: day.label,
          count: store?.dayCount(day.date) ?? 0,
          max,
          isToday: day.isToday,
          noData: !hasData,
          done: tasksStore()?.doneOn(day.date) ?? 0,
        }),
      );
    });
  }
}
