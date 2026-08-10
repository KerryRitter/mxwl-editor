# AI layer

Turns a plain-text brief into one workspace per ticket and one terminal per step,
each running your AI CLI with a scoped prompt already typed in.

Open with **Ctrl+Shift+A**, the header bot button, or `Run AI tasks…` in the palette.

## Settings → AI

| Field | Purpose |
|---|---|
| `defaultCli` | Claude Code · Codex · Cursor · Gemini · Kimi · GitHub Copilot · Qwen Code · OpenCode · Goose |
| Binary | Override the command (`claude`, `codex`, `cursor-agent`, …) |
| Extra flags | Appended before the prompt argument |
| Workspace folder template | Folder name per ticket. Vars: `${key} ${keyLower} ${keyNum} ${slug} ${title}` |
| Base repo folder | Folder under `workspacesRoot` to run branch init from |
| Branch init command | Run when the ticket folder is missing |
| Init timeout | Seconds to wait for the folder to appear |
| Refine prompts | Ask the CLI (headless) to rewrite prompts before running |

Folders resolve against the host's `workspacesRoot`, so `zipper-${key}` →
`~/Workspaces/zipper-PLAT-5874`.

Each CLI ships a headless flag used by the planner and the prep phase (`-p`,
`codex exec`, `opencode run`, `goose run -t`, `kimi --print`). A CLI that renames
its flag is still usable — put the right one in **Extra flags** and override the
binary with a wrapper.

## Brief format

Items above the divider line are **targets**, items below are **steps**. Every
step runs against every target.

```
1. PLAT-5874 — [Bugs] Payments, Stripe & checkout
2. PLAT-5687 — Purchase limits & payment transparency

for each of the epics that need worked, please open tabs to:
1. $agent-pre-merge
2. $agent-dev any remaining issues
3. $agent-qa (and take notes as we use playwright to examine the UI)
```

The divider is any line ending in `open tabs to:`, `for each…`, `run these:`,
`do the following:` or `steps:`. Unnumbered lines directly under a step fold into
it; a blank line ends the step. Anything else becomes shared context appended to
every prompt. With no divider, keyed lines (`ABC-123`) are targets and the rest
are steps.

Step labels drop the `$agent-` prefix — `$agent-qa (…)` becomes the tab label `qa`.

A one-liner works too. With no lists at all, ticket keys are read straight out of
the sentence and the brief becomes the single step, so
`open up PLAT-5583 and PLAT-5577` gives two workspaces with one terminal each.

## Setup command in the brief

A leading clause naming a directory and a command becomes a one-off **setup**
phase, so branch creation does not have to live in Settings:

```
in ~/Workspaces/zipper, run /agent:init-branch for both branches,
then open up tabs for PLAT-5583 and PLAT-5577
```

| Read from the brief | Meaning |
|---|---|
| `in <dir>` / `open a terminal to <dir>` | Where to run. Needs a real path (`~…` or `/…`) |
| `run <cmd>` | `/slash-command` → sent to the AI CLI as a prompt. Anything else → typed into the shell |
| `then` / `after that` | Blocks: waits for the setup command to **exit** before opening the tabs |
| `in parallel` | Does not block |

A slash-command keeps its trailing phrase (`/agent:init-branch for both
branches`); a shell command keeps only the token, since prose would break it.
Either way the clause is stripped from the per-ticket prompts — it is a one-off.

### What "done" means

The gate is the setup command exiting, not the ticket folders appearing. Folder
presence is a bad signal: a command like `/agent/init-branch` creates
`zipper-{KEY}` in its first step and then spends minutes checking it out,
building it and booting it — and if the folder already existed, the check passes
instantly. Either way the ticket agents would land on a half-built tree.

So mxwl appends an exit-code marker to the setup line and polls for it, bounded
by `initTimeoutSec`. A non-zero exit fails the run. Once it exits, the ticket
folders get a short grace period to be found; missing then means the command and
`Workspace folder template` disagree, which more waiting will not fix. On any
failure the ticket tasks are skipped and the setup terminal stays open.

**A blocking `/slash-command` setup runs headless** (`claude -p`, `codex exec`),
because an interactive CLI sits at its REPL after the turn and would never hand
the shell back. Output still lands in the setup terminal. Non-blocking setups
(`in parallel`) still launch the CLI interactively.

Headless means nothing can answer a permission prompt, so whatever grants the
setup its permissions has to be on that line. Settings → AI → per-CLI args goes
onto both the interactive and the headless line, so
`--permission-mode acceptEdits` — or `--dangerously-skip-permissions` for a fully
unattended setup that runs shell steps — belongs there. Note the args apply to
the per-ticket agents too, not just to setup.

Settings → AI `Base repo folder` + `Branch init command` remain the fallback for
briefs that don't name a setup command. If the brief did name one, mxwl will not
silently run a second, different init command.

## Run

Per target:

1. `test -d <path>` over a host shell.
2. Missing → open the base repo workspace, run the init command in a **visible**
   terminal (so it can be answered if it prompts), poll every 4s until the folder
   exists or the timeout trips.
3. Open the workspace without stealing focus.
4. Per step: stage the prompt at `$HOME/.cache/mxwl/ai/<runId>/<taskId>.md`, open a
   labelled terminal, run `<cli> <flags> "$(cat <file>)"`.

Prompts go through a file because the PTY line discipline caps input at 4096
bytes, and because command-substitution output is not re-expanded — `$agent-*`
tokens in the prompt reach the CLI verbatim.

Progress streams on `ai:event`. Cancelling stops *pending* tasks; terminals
already launched keep running.

## Terminal lifetime

Sessions are owned by main, not the renderer. The pane attaches to an existing
session and replays up to 256KB of scrollback, so switching bottom tabs or
workspace tabs never kills a running agent. Only the explicit close button ends a
session.
