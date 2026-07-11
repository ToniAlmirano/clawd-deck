# Clawd Deck 🦀

Turn your Elgato Stream Deck into a live control room for [Claude Code](https://claude.ai/code).

A board of your running agents — each with an animated **Clawd** — plus usage gauges, an activity heatmap and task stats. Built for people who run several Claude Code sessions at once and want to know, at a glance, **which one needs them**.

> **Unofficial.** Not affiliated with, endorsed by, or sponsored by Anthropic or Elgato. "Claude", "Claude Code" and the Clawd mascot belong to Anthropic; "Stream Deck" is Elgato's.

---

## What it does

### 🦀 Session board
Every active Claude Code session lands on its own key, automatically.

| State | Looks like | Meaning |
|---|---|---|
| **WORKING** | calm blue, Clawd busy | It's running — leave it alone |
| **YOUR TURN** | bright green, **pulses**, Clawd waves | It finished — go back to it |
| **QUESTION** | purple, pulses | It's asking you something |
| **PENDING** | dim green, calm | You already clicked it; it's waiting on your input |
| **OFFLINE** | grey, Clawd asleep | Session ended (keeps the project name) |

- **Priority ordering** — sessions that need you float to the top, working ones always stay visible, offline sinks. You never lose a busy agent behind a wall of finished ones.
- **Click a key → jump to that exact terminal tab** (iTerm2, matched by TTY).
- **Per-project animations** — each project gets its own Clawd working pose (thinking, hammering, sparkles, loading bar) so sessions are easy to tell apart.
- **Auto-cleanup** — a session untouched for 2h leaves the board.

### 📊 Usage gauges
Reads the same data as Claude Code's `/usage`, straight from your local OAuth token (macOS Keychain — nothing is sent anywhere).

- **Session (5h)** rolling window
- **Weekly** (all models)
- **Per-model weekly** limit (currently *Fable*) — the key renames itself to whatever model the API reports

### 🔥 Activity & effort
- **Week heatmap** — a GitHub-style contribution graph of your Claude Code activity, one key per day
- **Week / Month / Level** — totals with dynamic goals, relative to your own record
- **Gamification** — streak, personal record, today's goal
- **Tasks** — pending / done today / done this week, from Apple Reminders

---

## Requirements

- **macOS 13+**
- **Stream Deck app 6.6+** and a [Stream Deck](https://www.elgato.com/stream-deck) device
- **Node.js 20+**
- **Claude Code** with [HTTP hooks](https://code.claude.com/docs/en/hooks-guide) support
- *(optional)* **iTerm2** — for click-to-jump-to-session
- *(optional)* **Apple Reminders** — for the task tiles

## Install

```sh
git clone https://github.com/ToniAlmirano/clawd-deck.git && cd clawd-deck
npm install
npm install -g @elgato/cli    # one-time; provides the `streamdeck` CLI
npm run build
npm run link                  # register the plugin with Stream Deck
npm run hooks:install         # add Claude Code HTTP hooks to ~/.claude/settings.json
```

Restart the Stream Deck app, then drag the actions onto your keys:

| Action | Keys |
|---|---|
| **Session** | as many as you want agents visible |
| **Session usage (5h)** / **Weekly usage** / **Per-model usage** | 2 adjacent keys each |
| **Week (heatmap)** | 7 keys |
| **Week · Month · Level** | 3 keys |
| **Gamification** | 4 keys |
| **Tasks (effort)** | 3 keys |

### Uninstall

```sh
npm run hooks:uninstall
npm run unlink
```

## How it works

```
Claude Code HTTP hooks → local server (127.0.0.1:9200) → SessionManager → Stream Deck keys
```

No daemon, no PTY parsing, no cloud. Keys are drawn as flat SVG and animated by pushing frames (~9 fps) — the Stream Deck rasterizes SVG statically and `setImage` does not support animated GIFs, so a flipbook is the only way to animate.

## Language

English by default. The UI follows your **Stream Deck app's language**; add one by dropping a `<language>.json` next to the manifest. Spanish (`es.json`) is included — PRs for other languages welcome.

## Permissions

- **Keychain** — reads the Claude Code OAuth token to fetch usage. Never logged, never leaves your machine.
- **Automation → iTerm2** — for click-to-jump.
- **Automation → Reminders** — for the task tiles.

macOS prompts the first time. All of it is optional: skip a permission and just don't use that action.

## Development

```sh
npm run watch        # rebuild on change
npm test             # unit + integration
npm run typecheck
```

Reload after a code change: `kill -9 $(lsof -nP -iTCP:9200 -sTCP:LISTEN -t)` — Stream Deck respawns the plugin. **Manifest** changes need a full restart of the Stream Deck app.

## Credits

- Built on top of **[agentsd](https://github.com/paultyng/agentsd)** by [Paul Tyng](https://github.com/paultyng) (MIT) — the session/hook foundation this grew from.
- Clawd's sprite geometry comes from **[clawd-tank](https://github.com/marciogranzotto/clawd-tank)** by [Marcio Granzotto](https://github.com/marciogranzotto) (MIT).
- **Clawd** is Anthropic's Claude Code mascot. This project is a fan-made, unofficial tribute.

## License

[MIT](LICENSE) — the file keeps the original copyright (Paul Tyng) alongside this fork's.
