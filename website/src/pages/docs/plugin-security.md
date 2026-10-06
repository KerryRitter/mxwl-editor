---
layout: ../../layouts/Doc.astro
title: "Plugin security"
description: "The sandbox, CSP, permissions, secrets, and network model."
source: "docs/plugin-security.md"
---

mxwl linked plugins are local code with explicitly brokered capabilities. The sandbox removes
ambient Electron and Node.js authority, while the permission system makes workspace access visible
and enforceable. It is a meaningful boundary, not a guarantee that untrusted code becomes safe
after the user grants powerful permissions.

Read the [authoring guide](/docs/plugins/) for setup and the [API reference](/docs/plugin-api/) for exact
method contracts.

## Trust model

A user chooses a directory, reviews its manifest, and enables the plugin. That decision means:

- the user trusts code in that directory to use the approved permissions;
- mxwl trusts the canonical directory to keep representing that plugin ID;
- future code changes using the same permission set run without another approval prompt;
- a permission-set change disables the plugin until the user approves it again.

The last point is deliberately narrower than code signing. API v1 has no package signatures,
publisher identities, lockfile verification, marketplace review, or automatic update trust chain.
Treat a Git checkout, shared drive, generated build directory, and auto-updated folder according to
who can write them.

## Frame sandbox

Each external workspace tool runs in an iframe with:

```html
sandbox="allow-scripts allow-same-origin"
```

The plugin receives its own origin:

```text
mxwl-plugin://<validated-plugin-id>
```

It does not receive Node.js, Electron, mxwl's preload API, or same-origin access to the parent
renderer. The sandbox does not grant top navigation, popups, forms, nested frames, or downloads.
The host additionally serves plugin resources with this effective Content Security Policy:

```text
default-src 'none'
script-src <this plugin origin>
style-src 'unsafe-inline' <this plugin origin>
img-src data: <this plugin origin>
font-src data: <this plugin origin>
connect-src 'none'
object-src 'none'
frame-src 'none'
form-action 'none'
base-uri 'none'
```

Practical consequences:

- JavaScript must be a local file such as `<script src="./index.js"></script>`.
- Inline handlers (`onclick="…"`), inline script blocks, `eval`, and remote scripts do not run.
- Styles can be local files or inline styles.
- Images and fonts must be local plugin files or data URLs.
- `fetch`, XMLHttpRequest, WebSocket, EventSource, and remote image beacons are blocked directly.
- External HTTP access must use the permission-gated `network.fetch` method.
- Navigation should use `browser.open`; do not depend on links escaping the frame.

Do not loosen your own security posture because code runs in a sandbox. DOM injection can still
steal any data already available to the plugin and send it through an approved bridge capability.

## Resource confinement

mxwl canonicalizes the linked plugin root. Every requested plugin asset must resolve beneath that
root, and a symlinked asset that resolves outside the root is rejected. Each asset is capped at
2 MiB and served with `nosniff` plus `no-store`.

The manifest entry must be a relative `.html` path without `..`. Runtime asset URLs are subjected
to the same canonical root check.

Workspace file paths use a separate boundary. File methods accept only workspace-relative paths;
absolute paths and `..` path segments are rejected. Backslashes are normalized. The local or SSH
filesystem still resolves symlinks that already exist _inside the workspace_. Treat such symlinks
as part of the workspace's trust boundary and do not use plugin file APIs as a general secret-file
reader.

## Bridge authentication

The browser SDK uses `postMessage`, but a plugin does not choose its effective identity:

- the host accepts messages only from the exact iframe window;
- the message origin must match `mxwl-plugin://<plugin-id>`;
- the method must be in the API v1 allowlist;
- the host binds the call to the frame's plugin and current workspace;
- the plugin must still be enabled;
- the manifest must request the method's permission;
- the saved grant must exactly match the current manifest permission set;
- responses are targeted back to the exact plugin origin.

Changing JavaScript fields, forging another plugin ID, or manually sending bridge messages does not
bypass those checks.

Contributions from the same plugin share an origin and permission/storage identity. They should be
treated as one security principal. Separate unrelated tools into separate plugin IDs when they need
different trust or permissions.

## Permission risk guide

| Permission       | What it exposes                                                                        | Author guidance                                                                              |
| ---------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `workspace:read` | Titles, host IDs, roots, issue keys, branches, dirty state                             | Avoid logging or transmitting paths and issue metadata unnecessarily.                        |
| `files:read`     | Repository source, configs, local artifacts, and potentially workspace symlink targets | Bound discovery, show what is read, and never transmit content without clear product intent. |
| `files:write`    | Overwrite/create UTF-8 files within the workspace path boundary                        | Preview destructive changes; preserve concurrent edits; do not hide generated files.         |
| `git:read`       | Branch, status, changed source, diffs, remote-derived PR URL                           | Diffs can contain credentials or unreleased code; handle them as sensitive source.           |
| `git:write`      | Stage, unstage, commit, and push                                                       | Require explicit user actions and display the branch/path/message before mutation.           |
| `browser:open`   | Open an HTTP(S) page inside the workspace browser                                      | Label destinations and defend against untrusted URLs or phishing-like UI.                    |
| `agent:prompt`   | Instruct the active agent, which may itself have broad workspace/tool access           | Show or summarize the prompt; do not silently issue recurring prompts.                       |
| `storage`        | Persist plaintext JSON under mxwl user data                                            | Use for preferences, not secrets; namespace by workspace and schema version.                 |
| `network:fetch`  | Reach public or private HTTP(S) services from the host                                 | Restrict destinations in plugin code; assume it can exfiltrate any data the plugin can read. |

Combinations matter more than individual rows:

- `files:read` + `network:fetch` can transmit source code or workspace secrets.
- `git:read` + `network:fetch` can transmit uncommitted diffs.
- `files:write` + `agent:prompt` can influence both workspace content and an active coding agent.
- `git:write` can publish already-staged content even without `files:read`.
- `workspace:read` + `network:fetch` can disclose local paths, branch names, and issue keys.

Request the smallest coherent set and explain surprising combinations in the plugin README.

## Credentials and secrets

API v1 does not provide a plugin secret vault. `storage.set` writes plugin-scoped JSON for
convenience and persistence; it is not documented as encrypted storage. Do not persist long-lived
passwords, private keys, bearer tokens, session cookies, or cloud credentials there.

Preferred patterns:

1. Use an existing service or CLI authentication flow outside the plugin when possible.
2. Keep short-lived credentials in memory and make their lifetime clear.
3. Ask an internal API to issue narrow, expiring tokens rather than storing a broad personal token.
4. Wait for a future host credential capability if secure durable authentication is essential.

Never put production credentials in the manifest, bundled JavaScript, repository, query string, or
example screenshots. Anything shipped in plugin assets is readable by the user and by code running
under that plugin ID.

## Network safety

`network.fetch` permits HTTP and HTTPS URLs and follows redirects. It is intentionally broad once
granted, including potential access to services reachable only from the user's machine or network.

Authors should:

- keep an explicit hostname allowlist in plugin code;
- construct URLs with `new URL()` rather than concatenating untrusted strings;
- require HTTPS for non-local production services;
- reject redirects or unexpected response data at the application layer when destination identity
  matters—the v1 broker follows redirects and does not expose redirect history;
- check `response.ok`, status, content expectations, and parsed data shapes;
- avoid reflecting arbitrary response HTML into the DOM;
- cap retries and never retry non-idempotent writes blindly;
- redact authorization headers and response bodies from diagnostics.

Because the host method returns text rather than a browser `Response`, browser CORS is not the
access-control boundary. The user-approved permission and your own destination policy are.

## DOM and content safety

Workspace files, Git patches, API payloads, task titles, Markdown, and persisted JSON are all
untrusted input from the plugin UI's perspective.

Use safe DOM assignment:

```js
const title = document.createElement("span");
title.textContent = task.title;
```

Avoid:

```js
container.innerHTML = task.description;
```

If rich Markdown or HTML is a core feature, use a locally bundled parser and sanitizer, keep the
sanitizer configuration explicit, and test links, images, raw HTML, SVG, event attributes, and
malformed URLs. CSP is defense in depth; it is not a replacement for output encoding.

## Mutating operations

For file and Git writes:

- attach mutations to a deliberate user gesture;
- show the exact affected path, hunk, commit message, branch, or remote action;
- disable duplicate submission while a call is pending;
- refresh source state after the call;
- expect stale-state rejection;
- do not automatically retry commit, push, agent prompt, POST, PATCH, PUT, or DELETE after an SDK
  timeout because the first operation may have succeeded;
- preserve error detail without claiming an operation was rolled back.

API v1 calls are not transactional. A sequence of writes can partially complete.

## Author checklist

Before sharing a plugin:

- [ ] The manifest requests only methods the current build uses.
- [ ] The README explains why each write, agent, or network permission is needed.
- [ ] No credentials or private endpoints are committed in assets or examples.
- [ ] All workspace/API/Markdown content is escaped or sanitized before rendering.
- [ ] Network destinations are restricted and responses are validated.
- [ ] File discovery is bounded and paths are always workspace-relative.
- [ ] Destructive actions require explicit confirmation or a clearly labeled direct action.
- [ ] Non-idempotent operations are not blindly retried after timeouts.
- [ ] Plugin storage contains only non-secret JSON and uses namespaced/versioned keys.
- [ ] Dependencies are pinned, audited, and bundled locally rather than loaded at runtime.
- [ ] The distribution process makes code updates reviewable.

## User review checklist

Before enabling someone else's plugin:

- inspect `mxwl.plugin.json` and understand every permission;
- inspect the linked directory or trust its publisher and update path;
- pay special attention to read + network and Git-write combinations;
- prefer a pinned Git checkout or release artifact over a mutable shared directory;
- disable or unlink the plugin when the path, publisher, or behavior is no longer trusted.

Disabling removes bridge access and the contributed UI. Unlinking forgets the path and grant but
does not delete source files or previously persisted plugin storage.

Report host-boundary vulnerabilities using the process in [SECURITY.md](/docs/security/). Continue
with [Testing and distribution](/docs/plugin-testing/) for dependency, release, and review practices.
