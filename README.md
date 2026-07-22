# mxwl

**SSH + browser + editor + terminal**, locked to one folder — with an MCP/CDP bridge so agents on the box can drive the desktop browser.

> **Alpha** (`0.2.0-alpha.2`) — see [ALPHA.md](./ALPHA.md) before shipping to teammates.

Not a VS Code clone. Ideal when you use **git worktrees** or **clone/copy into a new folder per ticket** so the folder name *is* the work unit (e.g. `myapp-PROJ-42`). mxwl opens that folder as one workspace: browser URL, title, and issue key come from **per-host** folder mapping.

```
┌─ workspace tabs (one per folder) ──────────────────────────┐
├──────────────────────┬──────────────────────────────────────┤
│                      │ file tree │ Monaco (SFTP / local)    │
│   Chromium browser   ├───────────┴───────────────────────────┤
│   multi-tab · CDP    │ Terminal  │  Dev Tools / Dev logs     │
└──────────────────────┴───────────────────────────────────────┘
```

## Full install

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

### Packaged install (Linux)

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

## Per-host config

- Folder regex → `${ticket}` / `${ticketNum}` for titles & preview URLs
- Dev services (any start/stop/logs commands)
- Folder filter + file-tree hide list
- Optional **test credentials** + CSS selectors for “Login as test user” in the browser toolbar

Global **Settings**: credentials (Jira/Bitbucket), MCP token, fallback URL. Schema notes: [docs/presets.md](./docs/presets.md).

## Keybinds

| Key | Action |
|---|---|
| `Ctrl/⌘ P` | Quick open file |
| `Ctrl/⌘ K` | Command palette |
| `Ctrl/⌘ T` | New workspace |
| `Ctrl/⌘ W` | Close workspace |
| `Ctrl/⌘ S` | Save file |
| `Ctrl/⌘ Shift F` | Search (ripgrep) |
| `Ctrl/⌘ ,` | Settings |
| `Esc` | Close modal |

## MCP bridge

Enable **MCP** on a workspace. mxwl reverse-tunnels CDP + a workspace MCP server through SSH:

- CDP → `http://localhost:9222` on the host (Playwright `connectOverCDP`)
- MCP → `http://localhost:9223/mcp`

Set an **MCP auth token** in Settings on shared remotes.

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
