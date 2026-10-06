---
layout: ../../layouts/Doc.astro
title: "Plugin API reference"
description: "The versioned manifest, SDK methods, permissions, and limits."
source: "docs/plugin-api.md"
---

This is the exact author-facing contract implemented by mxwl plugin API version 1. Start with the
[authoring guide](/docs/plugins/) if you have not built a plugin yet.

## Contents

- [Manifest](#manifest)
- [Browser SDK](#browser-sdk)
- [Context and lifecycle](#context-and-lifecycle)
- [Host methods](#host-methods)
- [Common types](#common-types)
- [Limits](#limits)
- [Errors and compatibility](#errors-and-compatibility)

## Manifest

Every linked directory must contain `mxwl.plugin.json` at its root.

```ts
type PluginManifest = {
  apiVersion: 1;
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  permissions?: PluginPermission[];
  contributes: {
    workspaceTools: WorkspaceToolContribution[];
  };
};

type WorkspaceToolContribution = {
  id: string;
  title: string;
  icon?: "code" | "diff" | "tasks" | "git" | "globe" | "book" | "puzzle";
  order?: number;
  entry: string;
};
```

### Manifest fields

| Field                        | Required | Contract                                                                                                                |
| ---------------------------- | -------: | ----------------------------------------------------------------------------------------------------------------------- |
| `apiVersion`                 |      Yes | Must be the number `1`.                                                                                                 |
| `id`                         |      Yes | 2–80 lowercase characters matching `[a-z0-9][a-z0-9._-]+`; `mxwl.*` is reserved.                                        |
| `name`                       |      Yes | Non-empty display name shown in Settings.                                                                               |
| `version`                    |      Yes | `major.minor.patch`, optionally followed by a hyphen prerelease such as `1.2.0-beta.1`. Build metadata is not accepted. |
| `description`                |       No | Short description shown in Settings.                                                                                    |
| `author`                     |       No | Author or organization display string.                                                                                  |
| `homepage`                   |       No | Project homepage string. API v1 does not validate or render it as a capability.                                         |
| `permissions`                |       No | Known permission strings. Omit or use `[]` for a UI-only tool. Duplicates are removed.                                  |
| `contributes.workspaceTools` |      Yes | Non-empty array of top-right tool tabs.                                                                                 |

String values are trimmed during parsing. Unknown permissions and unsupported icons reject the
manifest. Do not use unknown fields as a feature-detection mechanism; the parser returns only its
known contract.

### Workspace tool fields

| Field   | Required | Contract                                                                                                                         |
| ------- | -------: | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`    |      Yes | 1–64 lowercase characters matching `[a-z0-9][a-z0-9._-]*`; unique within this plugin.                                            |
| `title` |      Yes | Tab label. Keep it short enough for a dense tool deck.                                                                           |
| `icon`  |       No | One of the seven icon names in the type above; unknown values reject the manifest.                                               |
| `order` |       No | Finite number used for global tab sorting; defaults to `1000`. Equal orders sort by title.                                       |
| `entry` |      Yes | Relative path to an existing `.html` file inside the plugin directory. Absolute paths and any path containing `..` are rejected. |

Built-in Code and Changes use orders `100` and `200`. Third-party tools commonly start at `300`,
but this is convention rather than a reserved range.

One plugin can contribute several tools. Their stable registry keys are
`<plugin-id>:<contribution-id>`.

### Full example

```json
{
  "apiVersion": 1,
  "id": "io.example.delivery",
  "name": "Delivery Console",
  "version": "1.4.0-beta.2",
  "description": "Tasks and review status for the focused branch.",
  "author": "Example Engineering",
  "homepage": "https://engineering.example.test/delivery-console",
  "permissions": [
    "workspace:read",
    "files:read",
    "git:read",
    "browser:open",
    "storage",
    "network:fetch"
  ],
  "contributes": {
    "workspaceTools": [
      {
        "id": "tasks",
        "title": "Tasks",
        "icon": "tasks",
        "order": 310,
        "entry": "dist/tasks.html"
      },
      {
        "id": "review",
        "title": "Review",
        "icon": "git",
        "order": 320,
        "entry": "dist/review.html"
      }
    ]
  }
}
```

## Browser SDK

Load the SDK before your own script:

```html
<script src="/__mxwl/sdk/v1.js"></script>
<script src="./index.js"></script>
```

The absolute SDK path is intercepted inside the current plugin origin. Do not copy or bundle the
runtime SDK implementation; loading the host-served version keeps its message protocol paired with
the running host.

### `window.mxwl.apiVersion`

```ts
readonly apiVersion: 1
```

The SDK version. Use this for diagnostics and future feature gating.

### `window.mxwl.call()`

```ts
call<T = unknown>(
  method: string,
  params?: Record<string, unknown>
): Promise<T>
```

Calls one permission-gated host method. The SDK generates a request ID, matches the response, and
rejects with an `Error` containing the host message when the operation fails.

```js
const result = await window.mxwl.call("files.read", { path: "README.md" });
```

The client timeout is 30 seconds. Timeout rejects the plugin promise, but API v1 has no
cancellation channel; the host operation may still finish.

### `window.mxwl.getContext()`

```ts
getContext(): MxwlPluginContext | null
```

Returns the latest frozen context object, or `null` before the host has sent one. Prefer
`onContext()` for initialization.

### `window.mxwl.onContext()`

```ts
onContext(listener: (context: MxwlPluginContext) => void): () => void
```

Subscribes to initial and updated context. If a context already exists, it is replayed in a
microtask. Returns an unsubscribe function.

Context can be emitted when workspace state changes, not only when the iframe first loads. A
listener may therefore run several times with the same workspace ID.

### `window.mxwl.isVisible()`

```ts
isVisible(): boolean
```

Returns the latest tool visibility state. It defaults to `true` before the first visibility message,
so defer expensive work until `onVisibility()` or combine it with context initialization.

### `window.mxwl.onVisibility()`

```ts
onVisibility(listener: (visible: boolean) => void): () => void
```

Subscribes to whether this contribution is the selected tool in the active workspace pane. The
latest value is replayed to late subscribers after the host has sent at least one visibility event.
Returns an unsubscribe function.

Visibility is a scheduling hint, not a persistence boundary. A hidden frame can remain mounted,
and a visible frame can later be destroyed by reload, disable, unlink, or application shutdown.

## Context and lifecycle

```ts
type MxwlPluginContext = {
  apiVersion: 1;
  pluginId: string;
  contributionId: string;
  workspace: MxwlWorkspaceContext;
};

type MxwlWorkspaceContext = {
  id: string;
  title: string;
  remotePath: string;
  hostId: string;
  status: string;
  issueKey?: string | null;
  branch?: string | null;
  dirty?: boolean;
};
```

`pluginId` and `contributionId` come from the validated manifest. The host, not plugin JavaScript,
uses them to authorize calls.

Workspace notes:

- `id` is the current runtime workspace identifier.
- `title` is user-visible and can be manually renamed.
- `remotePath` is the root on its local or SSH host. It is informational; `files.*` accepts relative
  paths instead.
- `hostId` identifies the configured host.
- `status` is currently one of `disconnected`, `connecting`, `connected`, `reconnecting`, or `error`.
- `issueKey` depends on host derivation settings.
- `branch` is nullable outside a repository or before Git refresh.
- `dirty` can be absent before derived Git state exists.

The SDK freezes the top-level context and its workspace object. Treat every context object as an
immutable snapshot.

## Host methods

Every method requires both a manifest permission and an enabled plugin grant. Parameters are plain
structured-clone-compatible objects; results are JSON-like values unless noted.

### Permission map

| Permission       | Methods                                                                       |
| ---------------- | ----------------------------------------------------------------------------- |
| `workspace:read` | `workspace.getContext`                                                        |
| `files:read`     | `files.list`, `files.readDirectory`, `files.read`                             |
| `files:write`    | `files.write`                                                                 |
| `git:read`       | `git.status`, `git.changes`, `git.diff`, `git.pullRequestUrl`                 |
| `git:write`      | `git.stageFile`, `git.unstageFile`, `git.stageHunk`, `git.commit`, `git.push` |
| `browser:open`   | `browser.open`                                                                |
| `agent:prompt`   | `agent.prompt`                                                                |
| `storage`        | `storage.get`, `storage.set`                                                  |
| `network:fetch`  | `network.fetch`                                                               |

### `workspace.getContext`

Permission: `workspace:read`

```ts
call<MxwlWorkspaceContext>("workspace.getContext");
```

Returns the workspace portion of the latest host context. Usually `onContext()` is more efficient;
use this method when an operation needs an explicit fresh snapshot.

### `files.list`

Permission: `files:read`

```ts
call<string[]>('files.list', { query?: string })
```

Returns up to 200 workspace-relative file paths, fuzzy-sorted by `query`. The query limit is 200
characters. The host scans at most 3,000 files and caches that file list for about five seconds.
Workspace hide rules and `.git` exclusions apply.

This method is optimized for a normal code/file picker. It is not a complete filesystem crawl and
is not appropriate for discovering an intentionally hidden application directory.

```js
const candidates = await window.mxwl.call("files.list", {
  query: "invoice test",
});
```

### `files.readDirectory`

Permission: `files:read`

```ts
call<DirEntry[]>('files.readDirectory', { path?: string })

type DirEntry = {
  name: string
  path: string
  isDirectory: boolean
}
```

Reads one explicit directory. `path` is workspace-relative, limited to 4,096 characters, and
defaults to the workspace root when omitted or empty. Returned paths are workspace-relative.
Directories sort before files and names sort lexically within each group.

An explicit dot-prefixed directory can be read, but children whose exact names appear in the host's
hide list are filtered. Recurse deliberately and bound the work yourself.

```js
const entries = await window.mxwl.call("files.readDirectory", {
  path: ".agent-artifacts/local/PROJ-42",
});
```

### `files.read`

Permission: `files:read`

```ts
call<ReadResult>("files.read", { path: string });

type ReadResult =
  | { content: string; encoding: "utf8" }
  | { content: string; encoding: "base64" };
```

Reads one workspace-relative path. `path` is required and limited to 4,096 characters. Files that
contain a NUL byte are returned as base64; other files are decoded as UTF-8.

```js
const file = await window.mxwl.call("files.read", { path: "package.json" });
if (file.encoding !== "utf8") throw new Error("Expected text");
const pkg = JSON.parse(file.content);
```

### `files.write`

Permission: `files:write`

```ts
call<void>("files.write", { path: string, content: string });
```

Writes UTF-8 text to one workspace-relative path. `path` is required and limited to 4,096
characters. `content` may be empty and is limited to approximately 5 MiB of JavaScript string data.
The parent directory must already exist. The operation invalidates the host's file-list and Git
change caches.

API v1 has no append, mkdir, rename, delete, stat, transactional write, or compare-and-swap method.
Read-before-write if preserving concurrent edits matters, and make destructive intent obvious in
the UI.

### `git.status`

Permission: `git:read`

```ts
call<GitStatus | null>("git.status");

type GitStatus = {
  branch: string | null;
  dirty: boolean;
  ahead: number;
  behind: number;
};
```

Refreshes and returns the basic repository status. It returns `null` when the workspace is missing
or not connected at refresh time. Ahead/behind are `0` when no upstream comparison is available.

### `git.changes`

Permission: `git:read`

```ts
call<GitChangesSnapshot>("git.changes");

type GitChangesSnapshot = {
  branch: string | null;
  files: GitChange[];
  additions: number;
  deletions: number;
};
```

Returns paths changed relative to `HEAD`, including staged, unstaged, untracked, renamed, copied,
deleted, and conflicted paths. Results are cached briefly (about 1.5 seconds).

```ts
type GitChangeKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted";

type GitChange = {
  path: string;
  oldPath?: string;
  indexStatus: string;
  worktreeStatus: string;
  kind: GitChangeKind;
  staged: boolean;
  unstaged: boolean;
  additions: number | null;
  deletions: number | null;
};
```

`indexStatus` and `worktreeStatus` are the two columns from Git porcelain v1. Addition/deletion
counts are `null` for binary files or when Git could not calculate them. Snapshot totals treat
unknown counts as zero.

### `git.diff`

Permission: `git:read`

```ts
call<GitFileDiff>("git.diff", { path: string });

type GitFileDiff = GitChange & {
  oldText: string | null;
  newText: string | null;
  binary: boolean;
  hunks: GitDiffHunk[];
};
```

Returns before/after text for one path currently present in `git.changes`. `path` is required and
limited to 4,096 characters. Each side is limited to 5 MiB. For binary content, both text values are
`null` and `binary` is true.

`hunks` contains independently stageable **unstaged** hunks for tracked files:

```ts
type GitDiffHunk = {
  id: string;
  header: string;
  patch: string;
  additions: number;
  deletions: number;
};
```

The hunk ID is ephemeral. Refresh the diff after any working-tree/index change and never persist a
hunk ID.

### `git.stageFile`

Permission: `git:write`

```ts
call<string>("git.stageFile", { path: string });
```

Runs `git add -- <path>` for a path in the current change snapshot. Returns Git output or `Done`.
The path limit is 4,096 characters.

### `git.unstageFile`

Permission: `git:write`

```ts
call<string>("git.unstageFile", { path: string });
```

Runs `git reset -q HEAD -- <path>` for a changed path. Returns Git output or `Done`.

### `git.stageHunk`

Permission: `git:write`

```ts
call<string>("git.stageHunk", { path: string, hunkId: string });
```

Rebuilds the current unstaged patch, finds `hunkId`, and applies only that patch to the index.
`path` is limited to 4,096 characters and `hunkId` to 512. If the file changed after the diff was
loaded, the call rejects with a refresh-and-retry error.

### `git.commit`

Permission: `git:write`

```ts
call<string>("git.commit", { message: string });
```

Creates a commit from the current index. The trimmed message is required and limited to 500
characters. Returns command output or `Done`.

### `git.push`

Permission: `git:write`

```ts
call<string>("git.push");
```

Pushes the current branch. If it has no upstream, mxwl runs the equivalent of
`git push -u origin <branch>`. Returns command output or `Done`.

The host-side push timeout is 120 seconds, but the SDK request timeout remains 30 seconds. A client
timeout does not prove the push failed; refresh status before retrying.

### `git.pullRequestUrl`

Permission: `git:read`

```ts
call<string>("git.pullRequestUrl");
```

Builds a new pull/merge-request URL from `origin` and the current branch. GitHub, GitLab, and
Bitbucket receive provider-specific creation URLs. Other parseable HTTP/SSH remotes return the
repository base URL. The method does not open the URL; combine it with `browser.open`.

```js
const url = await window.mxwl.call("git.pullRequestUrl");
await window.mxwl.call("browser.open", { url });
```

### `browser.open`

Permission: `browser:open`

```ts
call<string>("browser.open", { url: string });
```

Opens an HTTP(S) URL in a new tab in the current workspace browser and returns the new browser tab
ID. The URL is required and limited to 8,192 characters. Other schemes are rejected.

### `agent.prompt`

Permission: `agent:prompt`

```ts
call<void>("agent.prompt", { text: string });
```

Sends a non-empty prompt, up to 100,000 characters, to the active agent session for this workspace.
The call requires an available agent session. It resolves when the host prompt operation resolves.

An agent turn can outlive the SDK's 30-second request timeout and continue after the plugin promise
rejects. Design the action as a handoff: show that it was submitted, avoid blind automatic retries,
and let mxwl's Agent surface show the durable result.

### `storage.get`

Permission: `storage`

```ts
call<T | null>("storage.get", { key: string });
```

Returns a previously stored JSON value or `null` when the key is absent. Keys are non-empty strings
up to 128 characters. Storage is scoped to the plugin ID across workspaces and contributions.

### `storage.set`

Permission: `storage`

```ts
call<null>("storage.set", { key: string, value: unknown });
```

Stores one JSON-serializable value and returns `null`. The complete pretty-printed JSON object for
the plugin must remain within 256 KiB. Circular values and unsupported structured data fail during
serialization. Unlinking a plugin does not delete this data.

There is no delete method in API v1. Store `null` to represent cleared data, or update a containing
object without the obsolete field.

### `network.fetch`

Permission: `network:fetch`

```ts
call<NetworkResponse>('network.fetch', {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  body?: string
})

type NetworkResponse = {
  status: number
  ok: boolean
  headers: Record<string, string>
  body: string
}
```

Makes an HTTP(S) request from the host process. The default method is `GET`; a supplied GET body is
ignored. Redirects are followed. The host timeout is 20 seconds. Request bodies and response text
are limited to 2 MiB. At most 50 headers may be supplied, and each header value is truncated to
8,192 characters. `set-cookie` is removed from returned headers.

There is no automatic JSON conversion, cookie jar contract, streaming body, download-to-file,
abort signal, or access to the raw response. Parse and validate explicitly:

```js
const response = await window.mxwl.call("network.fetch", {
  url: "https://tasks.example.test/api/tasks?state=open",
  headers: { Accept: "application/json" },
});

if (!response.ok) {
  throw new Error(
    `Task API returned ${response.status}: ${response.body.slice(0, 300)}`,
  );
}

const tasks = JSON.parse(response.body);
if (!Array.isArray(tasks))
  throw new Error("Task API returned an unexpected shape");
```

## Common types

The current standalone declarations cover SDK context and client methods. External plugins can add
the method-specific types below to their own source while API v1 remains string-dispatched:

```ts
type PluginPermission =
  | "workspace:read"
  | "files:read"
  | "files:write"
  | "git:read"
  | "git:write"
  | "browser:open"
  | "agent:prompt"
  | "storage"
  | "network:fetch";

type GitChangeKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted";
```

Use a generic at call sites when working in TypeScript:

```ts
const changes = await window.mxwl.call<GitChangesSnapshot>("git.changes");
```

The generic improves your local static checking; it does not validate host data at runtime.
Validate external network data and any persisted state whose schema can change.

## Limits

| Surface                         |                                    Limit |
| ------------------------------- | ---------------------------------------: |
| Plugin ID                       |                            80 characters |
| Contribution ID                 |                            64 characters |
| One served plugin asset         |                                    2 MiB |
| SDK request wait                |                               30 seconds |
| File path argument              |                         4,096 characters |
| `files.list` query              |                           200 characters |
| `files.list` returned results   |                                      200 |
| `files.list` scanned candidates |                                    3,000 |
| `files.write` text              |                      Approximately 5 MiB |
| One side of `git.diff`          |                                    5 MiB |
| Commit message                  |                           500 characters |
| Agent prompt                    |                       100,000 characters |
| Storage key                     |                           128 characters |
| Total plugin storage            |                       256 KiB serialized |
| HTTP URL                        |                         8,192 characters |
| HTTP request/response body      |                                    2 MiB |
| HTTP headers                    | 50; values truncated to 8,192 characters |
| Host HTTP timeout               |                               20 seconds |

Plugin asset limits apply per file, not to the whole directory. Bridge values still cross process
and iframe boundaries, so staying comfortably below hard limits produces a better UI.

## Errors and compatibility

Host errors become rejected JavaScript `Error` objects:

```js
try {
  await window.mxwl.call("files.read", { path: "missing.md" });
} catch (reason) {
  const message = reason instanceof Error ? reason.message : String(reason);
  showError(message);
}
```

Typical failures include:

- the plugin is disabled or its grants no longer match the manifest;
- the manifest did not declare the required permission;
- the workspace is missing, disconnected, or not a Git repository;
- a relative path is missing, absolute, or contains `..`;
- an argument exceeds its method limit;
- a changed path or hunk became stale;
- the active agent does not exist;
- an HTTP request timed out or exceeded its body limit;
- the 30-second SDK timer expired.

Do not branch product behavior on the exact English error text. Display it for diagnostics, but use
your own input validation and refresh flows for expected states.

API versioning rules:

- `apiVersion` is a manifest/runtime protocol version, not the plugin's release version.
- A plugin with an unsupported API version is rejected during discovery.
- Additive SDK features may appear without changing version 1; feature-detect them.
- An incompatible manifest or message contract requires a later API version.
- Plugin `version` changes do not migrate state automatically. Store an internal schema version if
  persisted data needs migration.

Continue with [Recipes](/docs/plugin-recipes/), [Testing and distribution](/docs/plugin-testing/), or the
[Security model](/docs/plugin-security/).
