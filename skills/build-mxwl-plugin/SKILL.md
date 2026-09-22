---
name: build-mxwl-plugin
description: Build, extend, debug, or review standalone external plugins for the mxwl workspace-tool deck using the implemented plugin API and authoring docs. Use for mxwl plugin manifests, sandboxed tool UIs, SDK integrations, and plugin release work; do not use for Codex, VS Code, browser, or generic application plugins.
---

# Build an mxwl plugin

Produce a working external mxwl plugin, not a mockup or an mxwl-specific fork. Follow the shipped
plugin API exactly and leave the result in a standalone directory that mxwl can link by path.

## Use the authoritative docs

Resolve this skill's canonical directory first if it was installed through a symlink. In the
version-controlled mxwl checkout, the documentation root is `../../docs` relative to this file and
the standalone SDK declaration is `../../sdk/mxwl-plugin-sdk.d.ts`.

Before editing plugin code:

1. Read [`../../docs/plugins.md`](../../docs/plugins.md) completely for the runtime, lifecycle,
   state, permission, UX, and installation model.
2. Read the relevant sections of [`../../docs/plugin-api.md`](../../docs/plugin-api.md) for every
   manifest field and host method the plugin will use. Check parameter/result shapes and hard
   limits; do not implement from memory.
3. Read the matching patterns in
   [`../../docs/plugin-recipes.md`](../../docs/plugin-recipes.md) when the task involves hidden
   files, polling, persisted state, HTTP, Git, agent handoffs, or multiple contributions.
4. Read [`../../docs/plugin-security.md`](../../docs/plugin-security.md) before implementing file or
   Git writes, network access, authentication, agent prompts, or rendering untrusted content.
5. Use [`../../docs/plugin-testing.md`](../../docs/plugin-testing.md) for the development loop,
   testing level, packaging, release, and troubleshooting relevant to the requested deliverable.

If those relative paths are unavailable, find the nearest `mxwl-editor` checkout containing
`docs/plugins.md`. Fall back to the same files in the official `KerryRitter/mxwl-editor` repository
only when no local checkout exists. If documentation and implementation appear inconsistent,
inspect `src/shared/plugins.ts`, `src/shared/pluginSdk.ts`, and
`src/main/plugins/PluginManager.ts`; do not invent a capability.

## Keep the plugin external

- Use the destination supplied by the user.
- For a new plugin with no requested destination, create a clearly named standalone sibling such as
  `mxwl-plugin-<slug>` outside the `mxwl-editor` repository. Report the chosen path.
- Do not add product-specific plugin code under mxwl's `src/` or `examples/` merely because the host
  checkout is open. Change the host only when the user explicitly requests a host capability or the
  requested plugin cannot be expressed through the documented API.
- Preserve an existing plugin's ID, framework, release process, and conventions unless the task
  requires a deliberate migration.
- Read and follow any instructions in the target plugin repository before changing it.

## Design against API v1

Define these before implementation:

- the user workflow and one or more `workspaceTools` contributions;
- a stable lowercase plugin ID and contribution IDs;
- the minimum exact permission set;
- which state is ephemeral, plugin-scoped, workspace-keyed, or project-owned;
- how context changes, visibility changes, stale async work, empty data, disconnection, and failures
  behave;
- which operations are destructive or non-idempotent and therefore require an explicit user action.

Use `apiVersion: 1`. Load `/__mxwl/sdk/v1.js` before application code and access the host only
through `window.mxwl`. Never depend on `window.parent`, renderer DOM, `window.api`, Node.js,
Electron, direct network fetches, remote runtime scripts, inline scripts, or undocumented bridge
messages.

Request only permissions used by the current build. In particular, treat these combinations as
sensitive and explain them in the plugin README:

- workspace/file/Git reads combined with `network:fetch`;
- `files:write` or `git:write`;
- `agent:prompt`;
- persistent authentication of any kind.

API v1 has no secret store. Do not place credentials in plugin assets, manifests, examples, or
plugin storage.

## Build the complete experience

Implement the smallest architecture appropriate to the plugin. Plain HTML/CSS/JavaScript is a good
default; retain an existing framework or use a bundled browser framework when it materially helps.
All runtime assets must be local, under the plugin root, and below the documented per-file limit.

The finished plugin should:

- have a valid root `mxwl.plugin.json` and at least one existing HTML entry;
- be useful in both a narrow quadrant and a maximized pane;
- use `onContext` as a repeatable lifecycle event and guard async work against stale contexts;
- use `onVisibility` to pause polling and expensive background work;
- keep workspace file paths relative and bound discovery rather than crawling indiscriminately;
- namespace plugin storage by contribution/workspace when state is not intentionally global;
- render workspace, Git, persisted, and network content as untrusted input;
- show loading, empty, disconnected, stale, success, and actionable error states as relevant;
- prevent duplicate mutation submissions and refresh observable state afterward;
- avoid blind retry of prompts, writes, commits, pushes, or HTTP mutations after SDK timeouts;
- include a focused README with install path, permissions and rationale, usage, development, tests,
  supported API/mxwl version, and known constraints.

Copy the standalone SDK declaration into the external repository when checked JavaScript or
TypeScript editor support benefits from it. The runtime SDK itself must still come from the host
URL.

## Verify proportionally

At minimum:

1. Parse `mxwl.plugin.json` as strict JSON and compare it with the documented schema.
2. Syntax/type-check application code and run the plugin repository's tests.
3. Check runtime asset sizes and confirm there are no remote or development-only asset URLs.
4. Exercise pure logic and a mocked SDK for non-trivial plugins.
5. When a runnable mxwl checkout is available, link or copy the built output into an isolated test
   fixture and verify the real iframe, context, permissions, and primary workflow. Do not alter the
   user's live mxwl settings unless they asked to install/link the plugin.
6. Test permission denial and the important empty/error/stale cases, not only the happy path.

If the task changes mxwl host code as well as an external plugin, run the focused host tests plus
typecheck. Keep host and plugin changes clearly separated.

## Hand off the result

Report:

- the standalone plugin path and plugin ID;
- what the contributed tool does;
- the exact permission set and why each permission is required;
- verification performed and any real-host behavior not exercised;
- the directory or `mxwl.plugin.json` path to paste into **Settings → Plugins**;
- whether a permission change will require reapproval for existing users.

Do not commit, push, publish, install into live settings, or modify the mxwl host unless the user
requested that action.
