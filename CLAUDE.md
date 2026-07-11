# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Clawd Deck — a Stream Deck plugin for Claude Code: an animated session board (Clawd),
usage gauges, an activity heatmap, and task stats. Forked from
[agentsd](https://github.com/paultyng/agentsd) (MIT, Paul Tyng).

## Hard constraints (learned the hard way)

- The Stream Deck SVG renderer supports **flat shapes only** — no nested `<svg>`, no `<g>`,
  no `transform`. Draw with absolute-coordinate `<rect>`/`<circle>`/`<text>`.
- `setImage` **does not animate GIFs** and rasterizes SVG statically. The only way to
  animate is a flipbook: push a new static SVG each frame (~9 fps ticker in `actions/base.ts`).
- **Never hard-code a home directory.** The plugin runs from inside its `.sdPlugin` folder,
  so its logs are at `process.cwd()/logs`.
- UI strings are **English keys** translated via `src/util/i18n.ts` (`t()`), with locales in
  `<uuid>.sdPlugin/<language>.json`. A missing key falls back to the English key itself.
- Manifest changes require a full restart of the Stream Deck app; code-only changes just need
  the plugin process killed (`kill -9` the `:9200` listener).

## Build & Test

Use npm scripts only — no Taskfile or Makefile.

- `npm run build` — rollup build → `com.tonialmirano.clawddeck.sdPlugin/bin/plugin.js`
- `npm run watch` — rollup watch mode
- `npm run dev` — Stream Deck dev mode
- `npm run link` / `npm run unlink` — link/unlink plugin in Stream Deck
- `npm run hooks:install` / `npm run hooks:uninstall` — manage Claude Code HTTP hooks in `~/.claude/settings.json`
- `npm run debug:hooks` — interactive hook debug script

## Architecture

Claude Code HTTP hooks → Plugin HTTP server (127.0.0.1:9200) → SessionManager → Stream Deck button/dial updates.
No bridge daemon, no PTY parsing. PermissionRequest hooks hold HTTP response open (120s timeout) for approve/deny from hardware buttons.

### State machine

Sessions move through 5 states: `DISCONNECTED → IDLE → PROCESSING → AWAITING_PERMISSION / AWAITING_ELICITATION`.
Auto-created sessions (missed SessionStart) start as `IDLE`. Current-state guards prevent nonsensical transitions (e.g. tool events from DISCONNECTED).
PostToolUse intentionally stays in PROCESSING — Stop moves to IDLE.

### Key behaviors

- **Auto-foreground**: Elicitation and PermissionRequest events bring the session to the active slot.
- **Stale pruning**: Sessions with no activity for 60s are pruned (PRUNE_INTERVAL_MS = 60s check).
- **Permission timeout**: 120s (PERMISSION_TIMEOUT_MS). Sends explicit deny on timeout.
- **Action DI pattern**: A single `setManager()` call in `plugin.ts` wires the `SessionManager` into all `ManagedAction` subclasses via a shared module-level reference in `actions/base.ts`.
