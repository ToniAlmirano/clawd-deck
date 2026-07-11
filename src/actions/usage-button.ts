import { action, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { usageMonitor } from "../usage-monitor";
import { usageTile } from "../util/usage-card";

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
 * Base for a usage gauge spread across N adjacent keys (intended: 2). Instances
 * are ordered by physical coordinate; each draws its slice of one wide widget.
 */
abstract class UsageButtonBase extends SingletonAction {
  protected abstract readonly metric: "session" | "weekly" | "scoped";
  protected abstract readonly label: string;
  private bound = false;

  override onWillAppear(ev: WillAppearEvent): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (ev.action as any)?.coordinates;
    if (c) coords.set(ev.action.id, { column: c.column, row: c.row });
    if (!this.bound) {
      usageMonitor()?.on("update", () => this.render());
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

  protected render(): void {
    const data = usageMonitor()?.latest ?? null;
    const win = !data
      ? null
      : this.metric === "session"
        ? data.session
        : this.metric === "weekly"
          ? data.weekly
          : data.scoped;
    // The scoped gauge names itself after whatever model the API reports (Fable today).
    const label =
      this.metric === "scoped" ? (data?.scoped?.modelName ?? this.label).toUpperCase() : this.label;
    this.ordered().forEach((act, keyIndex) => {
      act.setTitle("");
      act.setImage(
        usageTile({
          label,
          percent: win?.percent ?? null,
          resetsAt: win?.resetsAt ?? null,
          // Fable resets on the weekly cadence → same reset formatting as weekly.
          metric: this.metric === "session" ? "session" : "weekly",
          keyIndex,
        }),
      );
    });
  }
}

@action({ UUID: "com.tonialmirano.clawddeck.usage-session" })
export class UsageSessionButton extends UsageButtonBase {
  protected readonly metric = "session" as const;
  protected readonly label = "SESSION";
}

@action({ UUID: "com.tonialmirano.clawddeck.usage-weekly" })
export class UsageWeeklyButton extends UsageButtonBase {
  protected readonly metric = "weekly" as const;
  protected readonly label = "WEEKLY";
}

@action({ UUID: "com.tonialmirano.clawddeck.usage-fable" })
export class UsageFableButton extends UsageButtonBase {
  protected readonly metric = "scoped" as const;
  protected readonly label = "FABLE";
}
