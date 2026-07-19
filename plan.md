# mxwl — Genericize without losing Zipper

> **Status (2026-07-17):** Phase A–C implemented. Core is preset-driven; Zipper lives only in `presets/zipper.*`. Typecheck + build green. Default install preset remains `zipper` so existing dogfood is unchanged.

## Product frame

mxwl is **not** a remote IDE. It replaces the messy stack of:

> SSH session + tmux panes + Chrome windows + Cursor/editor tabs + sticky notes for ticket/URL/ports

One workspace tab = one remote folder, with three panes locked together:

| Pane | Replaces |
|---|---|
| Chromium (multi-tab, DevTools, zoom, CDP) | Chrome/Safari windows you alt-tab to |
| Monaco over SFTP + file tree | Editor tabs pointed at a remote path |
| Terminal (xterm ↔ remote PTY) | SSH + tmux |

Special sauce: **MCP + CDP reverse tunnel** so an agent *on the box* can drive the *desktop* browser and workspace.

Everything Zipper-specific becomes a **preset**. Core stays host-agnostic.

---

## Abstraction principle

```
Core (generic)              Preset (opinionated)
─────────────────────       ──────────────────────────────
SSH host + auth             Zipper host defaults
Workspace = remote folder   ~/Workspaces discovery root
Browser pane                URL derived from folder name
Terminal pane               cwd = folder
Editor / SFTP               hide-list for monorepos
MCP / CDP bridge            (unchanged — already generic)
Dev controls                command map per project
Ticket / PR panel           Jira key pattern + issue tracker
```

**Rule:** if a stranger cloning a random GitHub monorepo on a VPS can use it without reading Zipper docs, the core is generic enough. Zipper remains a first-class preset, not a fork.

---

## Target config model

Three layers, most-specific wins:

1. **App defaults** — empty/generic
2. **Active preset** — e.g. `zipper` (shipped + user-selectable)
3. **Per-host / per-workspace overrides** — optional

### Preset schema (`ProjectPreset`)

```ts
type ProjectPreset = {
  id: string                    // 'zipper' | 'generic' | custom
  label: string

  // Discovery
  workspacesRoot: string        // default '~/Workspaces'
  folderFilter?: string         // glob or regex, e.g. 'zipper*'

  // Derive workspace chrome from folder name
  derive: {
    // Named capture groups become template vars
    // e.g. 'zipper-(?<ticket>PLAT-\\d+)' or '(?<name>.+)'
    folderPattern: string
    titleTemplate: string       // '${ticket}' | '${name}'
    browserUrlTemplate: string  // 'https://plat-${ticketNum}__app.joinzipper.dev'
                                // or 'http://localhost:${port}' or ''
    issueKeyTemplate?: string   // '${ticket}' → Jira/Linear key
  }

  // Dev panel — arbitrary named services, not hard-coded web/api/multisite
  services: Array<{
    id: string                  // 'web' | 'api' | 'frontend' | ...
    label: string
    start: string               // run in workspace cwd via SSH exec
    stop: string
    restart: string
    logs: string
  }>

  // File tree
  hide: string[]                // ['node_modules', '.git', 'dist', 'out', ...]

  // Integrations (optional — panel hidden if unset)
  issueTracker?: 'jira' | 'linear' | 'github' | 'none'
  prProvider?: 'bitbucket' | 'github' | 'none'
}
```

Templates use `${var}` from regex named groups, plus helpers:

| Var | Source |
|---|---|
| `${name}` | full folder basename |
| `${ticket}` | named group or whole match |
| `${ticketNum}` | digits extracted from ticket (`PLAT-1234` → `1234`) |
| `${port}` | optional, from settings / service config |

### Shipped presets

**`generic` (default for new installs)**
```json
{
  "id": "generic",
  "label": "Generic",
  "workspacesRoot": "~/Workspaces",
  "derive": {
    "folderPattern": "(?<name>.+)",
    "titleTemplate": "${name}",
    "browserUrlTemplate": ""
  },
  "services": [],
  "hide": ["node_modules", ".git", "dist", "out", "build", ".next", "coverage"]
}
```

Browser starts blank (or settings `defaultBrowserUrl`). Dev panel hidden until services are defined. Ticket/PR panel hidden.

**`zipper` (your daily driver)**
```json
{
  "id": "zipper",
  "label": "Zipper",
  "workspacesRoot": "~/Workspaces",
  "folderFilter": "zipper*",
  "derive": {
    "folderPattern": "zipper-(?<ticket>PLAT-\\d+)|(?<name>zipper)",
    "titleTemplate": "${ticket}${name}",
    "browserUrlTemplate": "https://plat-${ticketNum}__app.joinzipper.dev",
    "issueKeyTemplate": "${ticket}"
  },
  "services": [
    {
      "id": "web",
      "label": "Web",
      "start": "npm run z -- dev start web",
      "stop": "npm run z -- dev stop web",
      "restart": "npm run z -- dev restart web",
      "logs": "npm run z -- dev logs web"
    },
    { "id": "api", "label": "API", "...": "…" },
    { "id": "multisite", "label": "Multisite", "...": "…" }
  ],
  "hide": ["node_modules", ".git", "dist", "out", "build", ".next", ".turbo", "coverage", ".cache", ".nx"],
  "issueTracker": "jira",
  "prProvider": "bitbucket"
}
```

First-run: if no preset chosen, offer **Zipper / Generic / Import JSON**. Your machine picks Zipper; public docs lead with Generic + “add a preset for your monorepo.”

---

## What moves where (code map)

| Today (hardcoded) | After |
|---|---|
| `derive.ts` `PLAT-(\\d+)` + `joinzipper.dev` | `deriveFromFolder(name, preset.derive)` |
| `DevController` `DevApp = 'web'\|'api'\|'multisite'` + `DEFAULT_DEV_COMMANDS` | `services[]` from preset; UI maps over list |
| `HostConfig.workspacesRoot` default `~/Workspaces` | preset default; host can override |
| FileTree `HIDDEN` set | `preset.hide` (+ optional user addons in settings) |
| Settings Jira/Bitbucket always shown | show only if preset `issueTracker` / `prProvider` set |
| README “for building Zipper” | README: SSH workspace tool; Zipper as example preset |
| package description Zipper-only | “SSH-native workspace for remote building” |

Core that stays **unchanged in spirit**:
- Host manager + safeStorage
- Multiplexed ssh2 (shell / sftp / exec / forwardIn)
- Browser WebContentsView + chrome
- Terminal sessions
- MCP + CDP bridge
- Session persistence / keybinds

---

## Optional: project-local override

Later (not blocking genericization): if workspace root contains `.mxwl.json`, merge over preset. Lets a repo declare its own services/URL pattern without touching app settings.

```json
{
  "extends": "zipper",
  "derive": {
    "browserUrlTemplate": "https://plat-${ticketNum}__app.joinzipper.localhost"
  }
}
```

Useful when local Caddy URLs differ from megaserver `.dev` URLs.

---

## UX that stays Zipper-excellent

| Moment | Behavior with Zipper preset |
|---|---|
| New workspace | Lists `~/Workspaces/zipper*` |
| Open `zipper-PLAT-5682` | Tab title `PLAT-5682`, browser → `.dev` URL, Jira key ready |
| Dev panel | Web / API / Multisite with your `z` commands |
| Ticket & PR | Same modal as today |
| MCP toggle | Same CDP `9222` + workspace MCP |

You should not feel a regression. Generic users just don’t see Zipper chrome.

---

## Phased work

### Phase A — Preset engine (core abstraction)
1. Add `ProjectPreset` to `shared/types.ts`
2. Ship `presets/generic.json` + `presets/zipper.json`
3. Settings: `activePresetId` (+ “Import preset…” later)
4. Rewrite `deriveFromFolder` to use templates + named groups
5. Generalize `DevController` / Dev panel to `services[]`
6. FileTree reads `hide` from preset
7. Gate Ticket/PR UI on preset integration flags
8. Migration: existing installs default `activePresetId = 'zipper'` so nothing breaks for you

**Done when:** flipping preset to `generic` removes Zipper URLs/commands; flipping back restores them. No Zipper strings left in derive/dev core paths.

### Phase B — Product shell for strangers
1. Rewrite README around “SSH + browser + editor + terminal + MCP”
2. 30s GIF of open-host → open-folder → three panes sync
3. LICENSE file, SECURITY.md (SSH secrets, CDP/MCP localhost-only)
4. CONTRIBUTING + “write a preset” doc with Zipper as the worked example
5. macOS target (even unsigned) — most curious outsiders are on Mac

### Phase C — Dogfood quality (keep winning vs tmux+Chrome)
1. Command palette (open workspace, focus pane, run service)
2. ripgrep-over-SSH search
3. Git status strip (branch + dirty) — not a full client
4. File watch / auto-refresh tree (poll or remote inotify helper)
5. Reconnect UX that doesn’t strand panes
6. MCP auth token option

### Phase D — Soft open source
1. Public repo, “experimental / Linux (+ macOS unsigned)” banner
2. Preset gallery issue template (“share your preset”)
3. Do **not** market as VS Code alternative

---

## Explicit non-goals (keep the niche sharp)

- Extension marketplace
- Local (non-SSH) workspaces as primary mode
- Full git client / merge UI
- Competing with Monaco on language intelligence (no LSP farm in v1)
- Multi-user hosted mxwl

If a feature doesn’t help “one remote folder, three synced panes, agent-reachable browser,” defer it.

---

## Success criteria

| Audience | Win condition |
|---|---|
| **You** | Zipper preset = today’s workflow, fewer bugs, same shortcuts |
| **Stranger** | Connect to any SSH box, open a folder, get browser+editor+terminal synced in <2 min with Generic preset |
| **Positioning** | Described as “remote workspace for builders/agents,” never “IDE” |
| **Code** | `rg joinzipper\\|PLAT-\\|npm run z` returns hits only under `presets/zipper.json` (and docs/examples) |

---

## Decision log (locked)

| Decision | Choice |
|---|---|
| Abstraction unit | **Preset JSON**, not plugins |
| Default for Kerry | `zipper` (migrate existing) |
| Default for public | `generic` |
| Dev apps | Open `services[]`, not enum |
| URL/ticket derivation | Regex named groups + string templates |
| Zipper coupling allowed in | `presets/zipper.json` + docs only |
| Competitor frame | SSH + tmux + Chrome + editor tabs |

---

## Next action

Start **Phase A**: introduce preset types + ship `generic`/`zipper`, wire derive + dev + hide-list, migrate your install to `zipper` so behavior is unchanged while the core goes generic.
