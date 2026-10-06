---
layout: ../../layouts/Doc.astro
title: "Projects, hosts & workspaces"
description: "One project, several machines. Settings that follow the work."
source: "docs/presets.md"
---

Create a **project** in mxwl, configure its **hosts**, then open **workspaces as tabs**
within a host. A project is app configuration stored in mxwl's local app database,
not a folder that must already exist. A host is where that project's checkouts live.
Several projects can share a machine, and a project can use several machines.

## Configuration ownership

| Layer | Settings |
|---|---|
| mxwl Settings | Runtime, notifications, agent/CLI defaults, installed plugins and permission grants, reusable GitHub/Jira/Bitbucket account credentials |
| Machine connection library | Reusable connection label, Local / SSH / Tailscale, address, port, username, authentication |
| Project | Repository identity, folder/title/issue/preview templates, services, hidden files, startup command, browser profiles, task/SCM provider, AI folder/init templates, plugin visibility |
| Project host | Machine connection + checkout path, workspaces/worktrees root, folder filter, app subdirectory, preferred browser profile, machine-specific URL/startup/service overrides |
| Workspace | One working folder, its project/location/profile identity, browser/editor/terminal/agent runtime and recovery state |

The selected project and host are navigation context, not global runtime configuration.
Switching context hides other workspace tabs without stopping their services or agents.
Breadcrumbs return to Projects, a project's Hosts, or the selected host's workspaces.
Closing the last workspace tab keeps you on that host, rather than opening another app.

## Set up an app

1. In **Projects**, choose **Add project**. Name your app and configure shared settings.
   Repository URL is optional. Every project automatically includes **This machine**:
   it is always available and cannot be removed or reassigned to a remote connection.
2. Choose **Configure checkout** on This machine, or **Hosts → Add host** for another
   checkout or machine. Choose a saved machine connection or the small **New** button
   beside its selector for SSH or Tailscale. Adding a connection
   returns you to the same project-host form without discarding checkout settings.
3. Set its checkout path and worktrees/workspaces root, then **Save project host**.
   This attaches existing code; it never clones or starts services automatically.
4. Select that host's **Workspaces → Open workspaces**. Choose a browser profile, then
   one or more working folders. The checkout is included even when a worktree filter
   excludes its basename. Without a filter, discovery lists that repository's Git
   worktrees and project/checkout-prefixed folders, not unrelated apps.
5. Add further hosts to this project for other machines. Add separate projects for
   other apps sharing those machines. Only attached hosts appear under a project.

**Manage connections** stores reusable machine access details. Editing a connection
affects all projects using it; checkout paths and app overrides remain project-specific.
The connection library does not open workspaces directly. The workspace picker and AI
task picker default to your selected project/host. A host can have multiple named checkouts.
**Checkout label** is optional, purely for display, and defaults to the machine name.
The automatic local host does not guess a repository path, create folders, or start
anything: configure its checkout before opening workspaces or running an AI task.

Internally, each project-host checkout is a `ProjectLocation` record; `locationId`
in the API/SDK identifies that binding. It is an implementation detail, not another
top-level navigation concept.

Paths belong to project hosts because a laptop may use `~/Workspaces/app` while a remote
box uses `/srv/work/app`. Folder filters restrict discovery, not filesystem permissions.
Explicit source folders opened through the API can remain unassigned; those use neutral
code/terminal defaults, not another project's services or credentials.

## Project settings

- **General:** repository URL, named-group folder regex, title/issue/preview URL
  templates, exclusions, startup command, AI workspace folder and initialization command. The default folder template is
  `${project}-${keyLower}`; `${project}` is a filesystem-safe project-name slug.
- **Browser:** named environment/account profiles, a default profile, URL and optional
  login selectors/test credentials.
- **Services:** start/stop/restart/logs commands. Each service has an optional relative
  working directory beneath the location's app directory.
- **Integrations:** task provider/project key and source-control provider/repository.
  Built-in GitHub, Jira, and Bitbucket API cards use accounts in **Settings → Accounts**.
  GitHub supports public access, an existing `gh` login, or a personal token, plus issue-to-worktree launching.
  Other providers can use plugins; GitHub/GitLab PR creation links use Git remotes.
  See [GitHub setup](/docs/github/) for repository inference, account access, and issue references.
- **Plugins:** inherit each globally approved plugin or disable it for this project.
  A project setting cannot grant permissions or enable a globally disabled plugin.

A project host inherits these settings unless it specifies an override. An empty service
array deliberately disables services for that host checkout. Editing shared settings refreshes
only workspaces of that project; startup commands never run again merely because settings
changed. Close workspaces before changing a checkout's host/project/app directory.

## Browser profiles and secrets

Use profiles such as **Local QA**, **Staging**, and **Admin**. Choose a profile when
configuring a project host; the inline **New** button creates and selects a profile
without losing the checkout form. Manage profiles and test-login details in
**Project settings → Browser**. Choose a profile when
opening a workspace, or inherit the host/project default. Its selection is fixed to
that workspace until reopened; changing another host's defaults does not switch its
account.

Project browser partitions are persistent and scoped by project, location, profile, and
working folder. Different apps, profiles, machines, and worktrees never implicitly share
cookies. Explicit browser groups provide additional account sandboxes.

Test passwords are encrypted with Electron OS secret storage and saved only in the local
projects configuration. If encryption is unavailable, saving a new test password fails;
configure the OS keychain first. Blank password edits keep the existing secret. Uncheck
**Login as test user** to remove it. Autofill refuses sites outside the configured browser
URL's origin. Plugins receive identity metadata, never login secrets or selectors.

## Monorepos and services

Set a project host's **App subdirectory** to `apps/web`. Agent and default terminal sessions
start there, and service commands run there unless a service specifies its own relative
`cwd`. The code explorer and Git diff still cover the complete working folder/repository.
Absolute or parent-traversing app/service subdirectories are rejected.

```json
{
  "id": "api",
  "label": "API",
  "cwd": "packages/api",
  "start": "npm run start:dev",
  "stop": "./scripts/stop-dev.sh",
  "restart": "./scripts/restart-dev.sh",
  "logs": "tail -f logs/api.log"
}
```

With no configured services, the Dev logs tab is hidden. Service commands are user-authored
shell commands; saving configuration does not execute them.

## Persistence and deletion

The local app database stores projects and project-host checkouts in versioned `projects.json`
under Electron's user-data directory (an atomic JSON store, not a server or repository file).
Writes use an atomic replacement. Host connections remain in `hosts.json`. Secrets and
host-specific paths are local configuration, not files checked into your repository.

Session checkpoints include location and browser-profile identity. Worktree creation
inherits the source project's location/profile and writes beneath its configured worktrees
root. AI runs explicitly target a project location; folder naming and branch initialization
come from the project, and the initialization checkout comes from the location.

Deleting a project removes only its project/location configuration, never source files.
Open-workspace guards prevent deleting a project/location in use or a host with attached
locations. Referenced browser profiles cannot be removed until their locations/workspaces
stop using them.
The default This machine checkout cannot be deleted, even through the API; deleting
its parent project still removes that project's configuration. Extra checkouts remain removable.

This is a clean model change, **without automatic conversion of legacy host-level app
settings**. Existing configuration files are not reset or deleted. Configure projects and
project hosts explicitly; old folders can still be opened without project behavior.
