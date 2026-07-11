import streamDeck from "@elgato/streamdeck";

import { HookServer } from "./hook-server";
import { SessionManager } from "./session-manager";
import { setManager } from "./actions/base";

import { SessionButton } from "./actions/session-button";
import { UsageMonitor, setUsageMonitor } from "./usage-monitor";
import { UsageFableButton, UsageSessionButton, UsageWeeklyButton } from "./actions/usage-button";
import { WeekHeatmapButton } from "./actions/week-button";
import { PeriodTotalsButton } from "./actions/totals-button";
import { ActivityStore, setActivityStore } from "./activity-store";
import { TasksButton } from "./actions/tasks-button";
import { TasksStore, setTasksStore } from "./tasks-store";
import { GamifyButton } from "./actions/gamify-button";

// Global error handlers — prevent silent crashes
process.on("uncaughtException", (err) => {
  streamDeck.logger.error(`Uncaught exception: ${err}`);
});
process.on("unhandledRejection", (err) => {
  streamDeck.logger.error(`Unhandled rejection: ${err}`);
});

const sessionManager = new SessionManager();
const hookServer = new HookServer(sessionManager);
const usage = new UsageMonitor();
const activity = new ActivityStore();
const tasks = new TasksStore();

// Wire manager into all managed actions (single setter replaces per-action setters)
setManager(sessionManager);
setUsageMonitor(usage);
setActivityStore(activity);
setTasksStore(tasks);

// Register actions
streamDeck.actions.registerAction(new SessionButton());
streamDeck.actions.registerAction(new UsageSessionButton());
streamDeck.actions.registerAction(new UsageWeeklyButton());
streamDeck.actions.registerAction(new UsageFableButton());
streamDeck.actions.registerAction(new WeekHeatmapButton());
streamDeck.actions.registerAction(new PeriodTotalsButton());
streamDeck.actions.registerAction(new TasksButton());
streamDeck.actions.registerAction(new GamifyButton());

streamDeck.logger.setLevel("info");

// Start hook server
hookServer.start().then(() => {
  streamDeck.logger.info("Hook server listening on :9200");
}).catch((err) => {
  streamDeck.logger.error(`Failed to start hook server: ${err}`);
});

sessionManager.start();
usage.start();
void activity.start();
void tasks.start();

// Graceful shutdown
async function shutdown(): Promise<void> {
  streamDeck.logger.info("Shutting down...");
  sessionManager.stop();
  usage.stop();
  activity.stop();
  tasks.stop();
  await hookServer.stop();
}

process.on("SIGTERM", () => { shutdown(); });
process.on("SIGINT", () => { shutdown(); });

// Connect to Stream Deck
streamDeck.connect();
