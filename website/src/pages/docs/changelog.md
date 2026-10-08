---
layout: ../../layouts/Doc.astro
title: "Changelog"
description: "What changed in each release."
source: "CHANGELOG.md"
---

## Unreleased

## 0.2.0-alpha.6 — 2026-10-08

### Added
- Persistent project/host/workspace tree with direct switching, search, and workspace rename/close controls
- Guided machine and project-host setup with connection testing, folder suggestions, optional preferences, and review
- Workspace-scoped embedded Chromium MCP tools and Playwright CDP connections, including SSH reverse tunnels
- Terminal activity spinners in the workspace tree and terminal tabs
- Native GitHub issue and pull-request cards, recently updated issue selection, and issue-to-worktree launching with agent context
- GitHub public access, existing CLI authentication, personal access tokens, connection checks, and Enterprise host support
- GitHub repository inference from project URLs or checkout remotes, including fork-aware PR lookup

### Changed
- The workspace tree replaces the horizontal project/host/workspace navigator
- Checkouts open directly from the overview; the workspace picker uses a single click and retains location and browser-account context
- Chat input starts with three visible lines, grows with the draft, and uses larger text
- CodeMirror 6 replaces the previous editor in Code and Changes, with lazy language loading, per-file undo/selection/scroll state, and read-only split or unified diffs
- The editor, terminal, and mobile dashboard share the website's charcoal and lime branding, bundled typography, and pixel wordmark

### Fixed
- Alt no longer reveals the application menu or steals typing focus
- Chat input no longer collapses when its panel is measured while hidden
- Terminal and chat web links open in the workspace's embedded browser
- Ctrl+S and Cmd+S save the active file throughout the code pane, including Find/Replace and the file tree; write failures remain visible with the draft preserved

## 0.2.0-alpha.5

### Added
- Project-first configuration with reusable projects, a permanent local checkout, and multiple local or SSH hosts per project
- Project/host breadcrumbs and host-scoped workspace tabs that keep background workspaces running
- Per-project browser profiles, services, integrations, AI task setup, and plugin visibility with checkout-specific overrides
- Tailscale machine discovery and Tailscale SSH connections without stored keys or passwords
- Shared branded application, tray, desktop launcher, and package icons
- Versioned local plugin manifests with enable/disable controls, permission-gated host APIs, scoped storage, and sandboxed workspace-tool UI
- A complete Task Board example plugin plus an authoring, architecture, lifecycle, and security guide
- Read-only directory discovery for plugins, including explicit hidden artifact folders
- Linked plugin installation from an arbitrary directory or manifest path, without copying or deleting external source
- A versioned browser SDK with context, visibility, and permission-gated host calls
- A standalone branch-artifact reader integration used to validate linked plugins end to end

### Changed
- Browser cookies, sessions, agent conversations, and workspace recovery are scoped to project, checkout, folder, and browser profile
- Browser, editor, terminal, and layout handling improved across workspace switches
- Linux installer installs bundled icons and replaces the executable atomically
- Code Explorer and Changes now register as built-in plugins through the same workspace-tool contribution registry
- Linked plugins are disabled on first discovery and automatically require approval again when requested permissions change

### Upgrade notes
- Legacy host-specific application settings are not migrated automatically. Create projects and configure their checkout paths, browser profiles, services, integrations, and AI task settings after upgrading.

## 0.2.0-alpha.4

### Added
- Live working-tree review in the Code quadrant with changed-file navigation and unified / split syntax-highlighted diffs
- Manual names for workspace and terminal tabs
- Crash-safe workspace / terminal tab recovery, including active tabs, terminal output checkpoints, agent drafts, editor tabs, and panel layout
- Persistent whole-app UI zoom (75–200%) with header controls and keyboard shortcuts
- Stage files or individual hunks, commit, push, and open a pull request from the Changes tab
- Send selected diff lines to the active agent for explanation or a fix
- Maximizable quadrants and persistent Balanced, Code, Review, Debug, and Agent layout presets
- Named tmux terminal tabs for host-side process survival
- One-action ticket launcher for a sibling worktree, browser cookie sandbox, and seeded agent
- Global fuzzy search across files, workspaces, commands, agents, and open editor/browser/terminal/agent tabs
- Persistent agent notification bell with finished, needs-attention, and failed events; background toasts jump directly to the originating agent
- Agent working, idle, blocked, and failed status rollups on workspace tabs
- Background-resident agent runtime with tray controls and optional launch at login
- Agent restart recovery: selected agents relaunch in restored local or SSH workspaces, with conversation history retained
- One live fleet/attention view across every open host with concise activity summaries
- Notification controls for in-app/desktop delivery, stable-state delay, sound, active-workspace suppression, and per-agent muting
- Token-authenticated local/LAN control API and responsive mobile dashboard
- `mxwl agent list`, `get`, `focus`, `prompt`, and `wait` automation commands

### Changed
- Session checkpoints are written atomically; restored terminal tabs clearly identify a fresh shell or a reattached tmux session

## 0.2.0-alpha.3

### Added
- ACP-backed Agent tab with streaming output, permissions, modes, saved conversations, slash commands, and file mentions
- AI task planning and execution workflows
- Workspace tab groups and multi-open support
- Installer and macOS release packaging improvements

### Changed
- Terminal and browser sessions reconnect more reliably as workspace visibility changes
- Agent transcript text can be selected and copied

## 0.2.0-alpha.2

### Added
- Per-host test credentials + “Login as test user” browser action
- Terminal reconnect / dead-session handling; wait for workspace connect before opening a PTY

### Changed
- Browser reload is a hard refresh (ignore cache)
- README full install docs (system deps, package, AppImage/deb)

## 0.2.0-alpha.1

### Added
- Per-host project config: folder pattern, URL templates, Dev services, hide list
- Clone host
- Embedded Chromium DevTools (Elements / Network / …) in the bottom panel
- Secret encryption status banner; `enc:` / `insecure:` secret prefixes
- Unit tests for folder derive helpers; GitHub Actions CI
- Crash log file under app userData

### Changed
- Removed Example App/Generic preset switching from the product path — config lives on each host
- Settings is credentials + fallbacks only
- SSH reconnect caps after repeated failures

### Alpha notes
- Linux packages are the primary distribution; mac/win unsigned builds optional
- See [ALPHA.md](/docs/alpha/)
