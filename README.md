<div align="center">

<h1>mxwl</h1>

**The agent command center for local and remote workspaces.**

Browser, code review, terminals, services, and coding agents—locked to the same folder.

[![Release](https://img.shields.io/github/v/release/KerryRitter/mxwl-editor?include_prereleases&sort=semver&style=flat-square&color=8b5cf6)](https://github.com/KerryRitter/mxwl-editor/releases) [![CI](https://img.shields.io/github/actions/workflow/status/KerryRitter/mxwl-editor/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/KerryRitter/mxwl-editor/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/KerryRitter/mxwl-editor?style=flat-square)](./LICENSE) [![Linux](https://img.shields.io/badge/Linux-AppImage%20%7C%20deb-0ea5e9?style=flat-square&logo=linux&logoColor=white)](#install) [![macOS](https://img.shields.io/badge/macOS-Intel%20%7C%20Apple%20Silicon-64748b?style=flat-square&logo=apple&logoColor=white)](#install)

[Install](#install) · [See what it does](#one-folder-one-command-center) · [Control your agents](#run-the-fleet-not-just-one-chat) · [Docs](#docs) · [Latest release](https://github.com/KerryRitter/mxwl-editor/releases/tag/v0.2.0-alpha.4)

</div>

> [!IMPORTANT]
> mxwl is an early alpha. Start on a non-production machine and read the [current limitations](./ALPHA.md) before rolling it out to a team.

## Product tour

### Review the working tree without leaving the cockpit

[![mxwl Changes view showing a side-by-side TypeScript diff, changed-file navigation, hunk staging, commit, push, and pull-request controls](./docs/assets/mxwl-review.png)](./docs/assets/mxwl-review.png)

<p align="center"><sub><strong>Changes</strong> — every changed file, unified or split diffs, hunk staging, commit, push, PR, and agent handoff.</sub></p>

### Know which agent needs you

[![mxwl Agent view showing three workspaces and a live fleet popover with attention, working, and idle agents](./docs/assets/mxwl-agent-fleet.png)](./docs/assets/mxwl-agent-fleet.png)

<p align="center"><sub><strong>Agent control</strong> — one attention queue and live fleet across local and SSH workspaces.</sub></p>

<p align="center"><sub>Captured from the real app with reproducible demo workspaces. No UI mockups.</sub></p>

## Why mxwl exists

Modern development rarely lives in one editor window. A ticket may need its own worktree, authenticated browser session, dev server, terminals, pull-request review, and one or more coding agents. The hard part is keeping all of that context together—especially across SSH hosts, app restarts, and several tickets in flight.

mxwl makes the **folder the unit of work**. Open a repository, worktree, or ticket folder once and get a complete, isolated cockpit around it.

```text
myapp-PROJ-42/
├── browser       isolated cookies, tabs, DevTools, CDP
├── code          local or SFTP files in Monaco
├── changes       PR-style unified/split diffs and Git actions
├── terminals     PTYs, named tabs, optional tmux persistence
├── agent         Claude, Codex, Cursor, Gemini, and more via ACP
└── context       branch, ticket, services, links, history, layout
```

It is built for developers who run several worktrees, supervise coding agents, work on remote boxes, test multiple browser identities, or simply want to stop rebuilding their setup every time they change tickets.

## Where mxwl fits

These tools overlap, but they optimize for different centers of gravity. mxwl is not trying to out-terminal Herdr or out-editor Cursor—it connects the operational surface around a ticket.

| | **mxwl** | **Herdr** | **Agent CLI + tmux** | **Cursor** |
|---|---|---|---|---|
| **Center of gravity** | Folder/worktree command center | Terminal-native agent multiplexer | The current shell and repository | AI-native editor and agent platform |
| **Agent model** | Embedded ACP sessions across several agent providers | Existing agent CLIs running in real terminal panes | One agent process per shell, composed manually | Cursor Agent locally plus background/cloud agents |
| **Fleet awareness** | Workspace status, durable attention queue, fleet view, CLI, and mobile dashboard | Agent-aware sidebar, status detection, CLI, and socket API | Whatever tmux, hooks, and scripts you assemble | Agent sidebar/window, cloud projects, and remote agent control |
| **Browser loop** | Human- and agent-driven Chromium with tabs, cookie sandboxes, DevTools, and MCP/CDP | Bring your preferred browser workflow | Bring your preferred browser workflow | Built-in agent browser with workspace-persistent state |
| **Review loop** | Changed-file inbox, unified/split Monaco diff, stage file/hunk, commit, push, PR, ask agent | Use terminal Git/review tools in a pane | Agent- or CLI-specific | Deep editor, source-control, and agent review workflow |
| **Local + remote** | Local and saved SSH workspaces in one desktop cockpit | Local and remote machines in one TUI client | Runs wherever the shell runs | Local desktop agents plus managed cloud agents |
| **Persistence** | Tray runtime; restores the cockpit; optional tmux for process survival; ACP transcript recovery | Background server keeps panes alive; supported agent sessions can resume after restart | tmux preserves shells when configured; agent history depends on the agent | Local chat history plus persistent background/cloud runs |
| **Best fit** | You want the entire ticket environment—browser identities, diffs, services, terminals, and agents—bound to one folder | You live in terminals and want a fast, persistent herd across machines | You want the smallest, most composable setup and do not mind wiring it together | You want the deepest AI editor experience, autocomplete, and managed cloud agents |

The practical choice:

- Pick **mxwl** when browser state, remote environments, Git review, and multiple agent providers are all part of the same task.
- Pick **[Herdr](https://herdr.dev/)** when the terminal *is* the product surface and persistent real PTYs are the priority.
- Pick a **raw agent CLI + tmux** when maximum simplicity and composability matter more than a unified control plane.
- Pick **[Cursor](https://cursor.com/docs)** when editor intelligence, autocomplete, and Cursor's local/cloud agent ecosystem are the priority.

Comparison reviewed September 2026 using first-party documentation for [Herdr agents and session integrations](https://herdr.dev/docs/agents/), [Claude Code's terminal workflow](https://docs.anthropic.com/en/docs/claude-code/getting-started), and [Cursor Agent](https://cursor.com/docs/agent/overview), [Browser](https://cursor.com/docs/agent/tools/browser), and [Cloud Agents](https://cursor.com/docs/cloud-agent). Capabilities change quickly; “best fit” is an opinionated workflow recommendation, not a benchmark result.

## Install

### Linux — one command

```bash
curl -fsSL https://raw.githubusercontent.com/KerryRitter/mxwl-editor/main/scripts/install.sh | bash
```

The installer downloads and verifies the **x86_64 AppImage**, places `mxwl` in `~/.local/bin`, and registers a desktop launcher. Re-run the command to update. It requires `curl` and `sha256sum`.

### Download a release

| Platform | Artifact | Status |
|---|---|---|
| Linux x86_64 | [AppImage](https://github.com/KerryRitter/mxwl-editor/releases/download/v0.2.0-alpha.4/mxwl-0.2.0-alpha.4.AppImage) · [deb](https://github.com/KerryRitter/mxwl-editor/releases/download/v0.2.0-alpha.4/mxwl-editor_0.2.0-alpha.4_amd64.deb) · [checksums](https://github.com/KerryRitter/mxwl-editor/releases/download/v0.2.0-alpha.4/SHA256SUMS) | Primary / best tested |
| macOS Apple Silicon | [arm64 zip](https://github.com/KerryRitter/mxwl-editor/releases/download/v0.2.0-alpha.4/mxwl-0.2.0-alpha.4-arm64-mac.zip) | Ad-hoc signed, not notarized |
| macOS Intel | [x64 zip](https://github.com/KerryRitter/mxwl-editor/releases/download/v0.2.0-alpha.4/mxwl-0.2.0-alpha.4-mac.zip) | Ad-hoc signed, not notarized |
| Windows | Build from source | Portable build, lightly tested |

All current binaries are on the [`v0.2.0-alpha.4` release](https://github.com/KerryRitter/mxwl-editor/releases/tag/v0.2.0-alpha.4).

<details>
<summary><strong>Build from source</strong></summary>

Prerequisites: Node.js 20+, npm, Git, and native build tools for `node-pty`.

```bash
# Debian / Ubuntu / Pop!_OS
sudo apt install -y build-essential python3 make g++

# Fedora
sudo dnf install -y @development-tools python3 make gcc-c++

# macOS
xcode-select --install
```

Then clone and launch:

```bash
git clone https://github.com/KerryRitter/mxwl-editor.git
cd mxwl-editor
npm install
npm run dev
```

Package for a platform:

```bash
npm run package:linux   # AppImage + deb
npm run package:mac     # Intel + Apple Silicon zip
npm run package:win     # portable exe
```

If the terminal pane fails after an Electron upgrade, rebuild its native module with `npx electron-rebuild -f -w node-pty`.

</details>

### First launch

1. Add **This machine** or an **SSH host**, then choose its workspace root and browser URL.
2. Test the connection and open a folder—or press `Ctrl/⌘ T`.
3. mxwl binds the browser, code, terminals, services, and agents to that folder.
4. Clone the host configuration when another machine or environment uses the same project shape.

## One folder, one command center

```text
┌─ workspaces: PROJ-42  ·  PROJ-51  ·  api-server ───────────────┐
├───────────────────────────┬─────────────────────────────────────┤
│                           │  Code  │  Changes •                 │
│   Chromium browser        │────────┬────────────────────────────│
│   tabs + cookie groups    │ files  │ unified / split diff       │
│   per-workspace DevTools  │        │ stage · commit · push · PR │
│                           ├────────┴────────────────────────────│
│                           │  Agent  │  Terminal  │  Dev Tools   │
└───────────────────────────┴─────────────────────────────────────┘
```

| Surface | What it gives you |
|---|---|
| **Workspace bar** | Several local or SSH folders open at once, with live Git and agent state on each tab. Rename tabs when ticket names are not enough. |
| **Browser** | Embedded Chromium, multiple tabs, isolated cookie groups, test-user login helpers, native DevTools, zoom, and external-browser handoff. |
| **Code / Changes** | Monaco editing plus a fast changed-file list and PR-style unified or split diffs. |
| **Plugin deck** | Enable or disable Code and Changes, then add sandboxed workspace tools for your own task, source-control, or internal workflows. |
| **Bottom deck** | ACP agents, multiple named terminals, and service logs without leaving the workspace. |
| **Command bar** | `Ctrl/⌘ K` search across files, workspaces, tabs, agents, and commands. |
| **Attention bell** | A durable inbox for finished work, approval or authentication requests, and failures across the entire fleet. |

Maximize any quadrant or switch among **Balanced**, **Code**, **Review**, **Debug**, and **Agent** layouts. Whole-app zoom ranges from 75–200%, so the cockpit works on a dense desktop display or a laptop screen.

## Review changes like a pull request

The top-right quadrant switches between the file explorer and a dedicated **Changes** surface:

- See every changed file without waiting on a heavyweight refresh.
- Read the patch in unified or side-by-side mode with Monaco syntax highlighting.
- Stage an entire file or one hunk.
- Commit, push, and open the GitHub, GitLab, or Bitbucket pull request.
- Select changed lines and send them to the active agent for an explanation or a fix.

```text
changed file → inspect diff → select lines → ask agent → stage hunk → commit → push → PR
```

It is the review loop of a hosted PR tool, next to the code and agent that can act on the feedback.

## Make the cockpit yours

The top-right tool deck is plugin-driven. **Code Explorer** and **Changes** are built-in plugins and
can be independently enabled or disabled from Settings. Local plugins use the same workspace-tool
registry, run in sandboxed iframes, and request narrow capabilities for files, Git, browser tabs,
agents, scoped storage, or HTTP.

Drop a plugin into the folder opened by **Settings → Plugins**, reload, review its permissions, and
enable it. Start with the bundled [Task Board example](./examples/plugins/task-board/) or read the
[plugin architecture and API guide](./docs/plugins.md).

## Run the fleet, not just one chat

mxwl talks to coding tools through the [Agent Client Protocol](https://agentclientprotocol.com/). Run **Claude Code, Codex, Cursor, Gemini, Kimi, Copilot, Qwen, OpenCode, Goose**, or a custom ACP agent on the same host as the workspace.

- Watch streamed responses, reasoning, tool calls, plans, diffs, permissions, and usage inline.
- See `working`, `idle`, `blocked`, and `failed` state directly on workspace tabs.
- Switch the bell from the attention inbox to a live fleet view spanning local and SSH hosts.
- Configure delivery, delay, sound, active-workspace suppression, and per-agent notification muting.
- Keep the runtime resident in the system tray and optionally launch it at login.
- Supervise from a responsive, token-authenticated local/LAN dashboard.

The installed CLI controls that same runtime:

```bash
mxwl agent list
mxwl agent get PROJ-42 --json
mxwl agent focus PROJ-42
mxwl agent prompt PROJ-42 "Run the failing tests and fix them"
mxwl agent prompt PROJ-42 "Ship the fix" --wait
mxwl agent wait PROJ-42 --until idle,attention,error --timeout 600
```

Targets can be workspace IDs, workspace titles, issue keys, or unique agent labels. See the [agent control guide](./docs/agent-control.md) for dashboard and API setup.

## Start a ticket in one action

The ticket launcher turns a brief into an isolated execution environment:

```mermaid
flowchart LR
    A[Ticket or branch] --> B[Sibling Git worktree]
    B --> C[Workspace]
    C --> D[Cookie sandbox]
    C --> E[Named terminal]
    C --> F[ACP agent + seeded mission]
```

Reopen an existing worktree or create a new one, start a named browser cookie sandbox, launch the default agent, and seed it with the ticket mission. The workspace then carries the ticket and branch context into Jira, Bitbucket, browser URLs, and pull-request actions.

## Designed to come back

Closing a window should not erase the operating context around a task.

| Event | What mxwl preserves |
|---|---|
| Hide or close the window with background runtime enabled | Live SSH connections, browser state, terminals, agents, notifications, and control API keep running in the tray. |
| App or machine restart | Open workspaces, manual tab names, editor and terminal tabs, active tabs, recent terminal output, agent drafts and transcripts, and panel layout are restored. |
| Agent restart | The selected ACP agent relaunches in the restored workspace with its saved transcript available. |
| Terminal process continuity | A named tmux tab reattaches to its host-side session when tmux is installed. |

Ordinary PTYs reopen as fresh shells after a process restart, and ACP cannot resume halfway through an interrupted tool call. mxwl restores the context honestly; use tmux when the underlying process itself must survive.

## Built for local and remote work

- Browse and edit local files or SFTP files on an SSH host.
- Run terminals, services, and agents where the workspace actually lives.
- Reconnect SSH workspaces after network interruptions.
- Configure roots, folder filters, naming rules, hidden files, terminal startup commands, browser templates, issue templates, and service commands per host.
- Clone a host configuration when several machines share the same project shape.
- Create browser cookie groups for several identities against the same application.
- Expose loopback-only MCP/CDP bridges so a remote agent can operate the desktop browser.

## Keybindings

| Key | Action |
|---|---|
| `Ctrl/⌘ K` | Search everything |
| `Ctrl/⌘ P` | Quick-open a file |
| `Ctrl/⌘ Shift P` | Search commands only |
| `Ctrl/⌘ T` | Open a workspace |
| `Ctrl/⌘ Shift T` | Launch ticket worktree + sandbox + agent |
| `Ctrl/⌘ W` | Close the current workspace |
| `Ctrl/⌘ S` | Save the current file |
| `Ctrl/⌘ Shift F` | Search the workspace with ripgrep |
| `Ctrl/⌘ Shift A` | Run AI tasks |
| `Ctrl/⌘ ,` | Open settings |
| `Ctrl/⌘ +` / `Ctrl/⌘ -` / `Ctrl/⌘ 0` | Zoom in / out / reset |
| `Ctrl/⌘ Shift 1/2/3` | Maximize browser / code / bottom pane |
| `Esc` | Restore a pane or close a modal |

## Architecture

mxwl keeps privileged host operations in Electron's main process and exposes a narrow typed API to the renderer.

```mermaid
flowchart TB
    UI[React + Zustand UI] --> PRELOAD[Typed preload bridge]
    PRELOAD --> MAIN[Electron main process]
    UI --> PLUGINS[Workspace tool registry]
    PLUGINS --> SANDBOX[Sandboxed local plugins]
    SANDBOX --> PRELOAD
    MAIN --> LOCAL[Local workspace]
    MAIN --> SSH[SSH + SFTP workspace]
    MAIN --> ACP[ACP agent runtimes]
    MAIN --> WEB[Chromium WebContentsView]
    MAIN --> CONTROL[Authenticated control API]
    CLI[mxwl CLI] --> CONTROL
    MOBILE[Mobile dashboard] --> CONTROL
    ACP -. MCP / CDP .-> WEB
```

Core stack: Electron, React, TypeScript, Zustand, Monaco, xterm.js, ssh2, ACP, and MCP.

## Security model

- SSH passwords, key passphrases, and Jira/Bitbucket tokens use Electron `safeStorage` when available.
- Chromium debugging, MCP, and the control API bind to loopback by default.
- LAN dashboard access is opt-in and every API route requires the generated bearer token.
- Reverse tunnels expose ports on the remote host's loopback—not directly to the public internet.
- Shared remote machines should always use an MCP auth token.

Treat mxwl like a privileged developer tool: it can reach your hosts, files, browsers, and agents. Read the full [security guide](./SECURITY.md) before enabling remote control.

## Development

```bash
npm install
npm run dev          # launch with electron-vite
npm run typecheck    # TypeScript checks
npm test             # unit tests
npm run e2e          # Electron end-to-end suite
npm run ci           # typecheck + tests + production build
npm run docs:screenshots  # regenerate README captures with demo data
```

## Docs

| Guide | Covers |
|---|---|
| [Alpha status](./ALPHA.md) | Platform support, sharp edges, and recovery limits |
| [Agent runtime](./docs/agent.md) | ACP agents, conversations, permissions, and modes |
| [Agent control](./docs/agent-control.md) | Notifications, fleet view, CLI, dashboard, and API |
| [AI task runs](./docs/ai.md) | Planning and running work across several workspaces |
| [Host settings](./docs/presets.md) | Per-host project and service configuration |
| [Cookie sandboxes](./docs/tab-groups.md) | Browser identity isolation and tab groups |
| [Plugin architecture](./docs/plugins.md) | Manifests, workspace tools, permissions, bridge API, and examples |
| [Changelog](./CHANGELOG.md) | Release-by-release changes |
| [Security](./SECURITY.md) | Secrets, tunnels, tokens, and reporting |

## Release status

Current release: **[`v0.2.0-alpha.4`](https://github.com/KerryRitter/mxwl-editor/releases/tag/v0.2.0-alpha.4)**

Linux is the primary platform. macOS artifacts are ad-hoc signed but not notarized. Windows is buildable as a portable executable and is still lightly tested. There is no auto-updater yet.

Found a bug or have an idea? [Open an issue](https://github.com/KerryRitter/mxwl-editor/issues) with your OS, package type, host kind, and reproduction steps.

## License

[MIT](./LICENSE) © Kerry Ritter
