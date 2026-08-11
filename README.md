# mxwl

**SSH + browser + editor + terminal**, locked to one folder. mxwl is a workspace-first desktop tool for worktrees, ticket branches, and remote development boxes — with coding agents and an MCP/CDP bridge built in.

> **Alpha** (`0.2.0-alpha.3`) — see [ALPHA.md](./ALPHA.md) before shipping to teammates.

Not a VS Code clone. It is ideal when you use **git worktrees** or **clone/copy into a new folder per ticket** so the folder name is the work unit (for example, `myapp-PROJ-42`). mxwl opens that folder as one workspace, with its browser, editor, terminals, agents, and integrations all scoped to that folder.

```
┌─ workspace tabs (one per folder) ──────────────────────────┐
├──────────────────────┬──────────────────────────────────────┤
│                      │ file tree │ Monaco (SFTP / local)    │
│   Chromium browser   ├───────────┴───────────────────────────┤
│   multi-tab · CDP    │ Agent · Terminal · Dev Tools · logs   │
└──────────────────────┴───────────────────────────────────────┘
```

## Install

### Linux — one line

```bash
curl -fsSL https://raw.githubusercontent.com/KerryRitter/mxwl-editor/main/scripts/install.sh | bash
```

The installer builds the current `main` branch as an AppImage, installs `mxwl` to `~/.local/bin`, and registers it as the desktop-menu launcher. Its user-level launcher overrides an older system-wide `mxwl-editor` package. Re-run it to update. It needs Git, Node.js 20+, npm, and the native build tools below.

### Prerequisites

- **Node.js 20+** (CI uses Node 20; Node 22/24 also fine)
- **npm** (comes with Node)
- **Git**
- Native build tools for `node-pty` (needed on first `npm install`):

```bash
# Debian / Ubuntu / Pop!_OS
sudo apt install -y build-essential python3 make g++

# Fedora
sudo dnf install -y @development-tools python3 make gcc-c++

# macOS (Xcode CLI tools)
xcode-select --install
```

### From source (dev)

```bash
git clone https://github.com/KerryRitter/mxwl-editor.git
cd mxwl-editor
npm install
npm run typecheck   # optional sanity check
npm run test        # optional
npm run dev         # electron-vite — launches the app
```

If the terminal pane fails to load after Electron upgrades, rebuild the native module:

```bash
npx electron-rebuild -f -w node-pty
```

### Build a Linux package yourself

Build AppImage + deb locally:

```bash
npm install
npm run package:linux
# → dist/mxwl-*.AppImage
# → dist/mxwl-editor_*_amd64.deb
```

Or download those artifacts from [GitHub Releases](https://github.com/KerryRitter/mxwl-editor/releases).

```bash
# AppImage (no root)
chmod +x mxwl-*.AppImage
./mxwl-*.AppImage

# deb
sudo apt install ./mxwl-editor_*_amd64.deb
```

macOS / Windows packages:

```bash
npm run package:mac   # unsigned zip → dist/
npm run package:win   # portable exe → dist/
```

### First launch

1. **Add host** (this machine or SSH) → folder pattern, browser URL, Dev services
2. **Test** → **Open** a folder (or `Ctrl+T`)
3. Browser, editor, and terminal lock to that folder
4. **Clone host** to copy connection + project settings

## Quick start

Already have deps installed?

```bash
npm install
npm run dev          # electron-vite
npm run ci           # typecheck + tests + build
npm run package:linux   # AppImage + deb → dist/
```

## Features

### Workspace-first development

- Open local folders or SSH hosts; keep several workspaces open, each bound to one folder.
- Restore open workspaces on launch, switch between them without interrupting their browser, editor, terminal, or agent state, and reconnect SSH sessions when the network blips.
- Configure each host independently: workspace root, folder filter, naming regex, title/browser/issue templates, hidden files, terminal startup command, and dev services. Clone a host to reuse that configuration.
- Extract ticket and branch context from folder names, show Git status, open linked Jira issues and Bitbucket pull requests, and add custom browser URLs for each workspace.

### Browser and cookie sandboxes

- Use an embedded Chromium browser with multiple tabs, navigation, hard refresh, zoom, external-browser handoff, and native DevTools.
- Create coloured cookie sandboxes so the same site can be signed in as different users at once. Rename, clear, close, and move tabs between sandboxes.
- Save per-host test credentials and selectors, then use **Login as test user** to fill a browser login form.

### Code, terminals, and services

- Browse local or SFTP files, edit with Monaco, save files, and search the workspace with ripgrep.
- Run multiple PTY terminals per workspace; sessions survive panel switches, replay their scrollback when remounted, recover connection state, and can start a configured command in the first shell.
- Define per-host services with start, stop, restart, and log-tail commands; manage them from the Dev logs tab.

### Coding agents and AI task runs

- Talk to Claude Code, Codex, Cursor, Gemini, Kimi, Copilot, Qwen, OpenCode, Goose, or a custom ACP agent in the **Agent** tab. The agent runs on the workspace host, so remote workspaces use remote credentials and files.
- Render streamed responses, thoughts, tool calls, diffs, plans, permission requests, usage, and saved conversation history inline. Command and permission-mode aliases translate across agents.
- Start one AI run from a brief, fan it out across ticket workspaces and labelled terminals, optionally prepare/refine prompts, and follow or cancel progress without killing already-running shells. See [agent details](./docs/agent.md) and [AI task details](./docs/ai.md).

### Integrations and automation

- Connect Jira and Bitbucket credentials, resolve issue and pull-request links from workspace metadata, and keep secrets in Electron safe storage where available.
- Enable an MCP bridge per workspace: reverse-tunnel CDP and a workspace MCP server to the host so local tools and agents can drive the desktop browser. Set an MCP token for shared remotes.
- Use the command palette and keyboard shortcuts for workspace, file, settings, AI, and search actions.

For the full host configuration schema, see [host project settings](./docs/presets.md). For cookie-sandbox behavior, see [tab groups](./docs/tab-groups.md).

## Keybinds

| Key | Action |
|---|---|
| `Ctrl/⌘ P` | Quick open file |
| `Ctrl/⌘ K` | Command palette |
| `Ctrl/⌘ T` | New workspace |
| `Ctrl/⌘ W` | Close workspace |
| `Ctrl/⌘ S` | Save file |
| `Ctrl/⌘ Shift F` | Search (ripgrep) |
| `Ctrl/⌘ Shift A` | Run AI tasks |
| `Ctrl/⌘ ,` | Settings |
| `Esc` | Close modal |

## Architecture

```
main: HostManager · WorkspaceManager (ssh2 / local) · MCP
preload: typed window.api
renderer: React + Zustand + Monaco + xterm + WebContentsView chrome
```

## Releases

| Script | Output |
|---|---|
| `npm run package:linux` | AppImage + deb |
| `npm run package:mac` | unsigned zip |
| `npm run package:win` | portable exe |

Changelog: [CHANGELOG.md](./CHANGELOG.md) · Security: [SECURITY.md](./SECURITY.md)

## License

MIT — see [LICENSE](./LICENSE).
