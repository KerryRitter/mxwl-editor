---
layout: ../../layouts/Doc.astro
title: "Plugin recipes"
description: "Artifact readers, task APIs, Git views, and agent handoffs."
source: "docs/plugin-recipes.md"
---

These patterns solve the parts of plugin work that are easy to get subtly wrong: context races,
hidden-directory discovery, visibility-aware refresh, storage scoping, Git refresh, HTTP validation,
and irreversible actions. All examples target plugin API version 1.

See [Build a plugin](/docs/plugins/) for the starter and [API reference](/docs/plugin-api/) for exact
types and limits.

## A resilient application shell

Centralize host calls and visible state before adding product logic:

```js
// @ts-check
/// <reference path="./mxwl-plugin-sdk.d.ts" />

const state = {
  context: null,
  visible: false,
  generation: 0,
  loading: false,
  error: "",
};

function errorMessage(reason) {
  return reason instanceof Error ? reason.message : String(reason);
}

async function hostCall(method, params = {}) {
  try {
    return await window.mxwl.call(method, params);
  } catch (reason) {
    throw new Error(`${method}: ${errorMessage(reason)}`);
  }
}

async function refresh() {
  const context = state.context;
  if (!context || !state.visible || state.loading) return;

  const generation = ++state.generation;
  state.loading = true;
  state.error = "";
  render();

  try {
    const model = await loadModel(context.workspace);
    if (generation !== state.generation) return;
    renderModel(model);
  } catch (reason) {
    if (generation !== state.generation) return;
    state.error = errorMessage(reason);
  } finally {
    if (generation === state.generation) {
      state.loading = false;
      render();
    }
  }
}

window.mxwl.onContext((context) => {
  state.context = context;
  state.generation += 1; // Invalidate work started for the previous snapshot.
  void refresh();
});

window.mxwl.onVisibility((visible) => {
  state.visible = visible;
  if (visible) void refresh();
});
```

This avoids three common bugs:

- a slow request for workspace A rendering after the user switches to workspace B;
- every hidden plugin polling and rendering continuously;
- one rejected request becoming an unhandled promise rejection.

Keep manual refresh available even when automatic refresh exists.

## Discover a focused hidden artifact directory

`files.list` follows the workspace's normal hide rules and is capped for code-picker use. For a
known tool-owned directory such as `.agent-artifacts/local`, walk it explicitly with
`files.readDirectory` and hard limits.

```js
const ARTIFACT_ROOT = ".agent-artifacts/local";
const INTERESTING_FILES = new Set([
  "QA_PREP.md",
  "PLAN.md",
  "REVIEW.md",
  "IMPLEMENTATION.md",
  "STATUS.json",
]);

async function discoverArtifacts(root = ARTIFACT_ROOT) {
  const found = [];
  const queue = [{ path: root, depth: 0 }];
  const MAX_DEPTH = 3;
  const MAX_DIRECTORIES = 80;
  const MAX_FILES = 300;
  let visitedDirectories = 0;

  while (
    queue.length &&
    visitedDirectories < MAX_DIRECTORIES &&
    found.length < MAX_FILES
  ) {
    const current = queue.shift();
    visitedDirectories += 1;

    let entries;
    try {
      entries = await window.mxwl.call("files.readDirectory", {
        path: current.path,
      });
    } catch (reason) {
      // A missing optional root is an empty state, not a fatal plugin crash.
      if (current.path === root) return [];
      throw reason;
    }

    for (const entry of entries) {
      if (entry.isDirectory && current.depth < MAX_DEPTH) {
        queue.push({ path: entry.path, depth: current.depth + 1 });
      } else if (!entry.isDirectory && INTERESTING_FILES.has(entry.name)) {
        found.push(entry);
        if (found.length >= MAX_FILES) break;
      }
    }
  }

  return found;
}
```

If the branch or issue key identifies a single ticket, prefer a direct bounded read over traversal:

```js
function safeSegment(value) {
  return /^[A-Za-z0-9._-]+$/.test(value) ? value : null;
}

async function ticketArtifacts(workspace) {
  const ticket = safeSegment(workspace.issueKey || "");
  if (!ticket) return [];
  return window.mxwl.call("files.readDirectory", {
    path: `.agent-artifacts/local/${ticket}`,
  });
}
```

The segment validation is application-layer defense: do not interpolate arbitrary API or file
content into paths even though the host also rejects absolute paths and `..` segments.

## Read text and reject binary content

```js
async function readText(path) {
  const result = await window.mxwl.call("files.read", { path });
  if (result.encoding !== "utf8") {
    throw new Error(`${path} is binary and cannot be rendered as text`);
  }
  return result.content;
}
```

For several independent documents, preserve partial success:

```js
async function readDocuments(entries) {
  const settled = await Promise.allSettled(
    entries.map(async (entry) => ({ entry, text: await readText(entry.path) })),
  );

  return settled.map((result, index) =>
    result.status === "fulfilled"
      ? { ...result.value, error: null }
      : {
          entry: entries[index],
          text: "",
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        },
  );
}
```

Render filenames, headings, Markdown, task titles, and API content as untrusted data. Use
`textContent`, or bundle and configure a sanitizer if rich HTML is necessary.

## Match artifacts to a branch or issue

Host-derived `issueKey` is preferable when available. A conservative branch fallback can cover
common conventions:

```js
function ticketFromWorkspace(workspace) {
  if (workspace.issueKey) return workspace.issueKey;
  const match = workspace.branch?.match(
    /(?:^|[/_-])([A-Z][A-Z0-9]+-\d+)(?:$|[/_-])/i,
  );
  return match?.[1]?.toUpperCase() || null;
}
```

Do not assume every repository has a ticket, a branch, or Git. Make the no-ticket state useful by
showing recent artifact directories or explaining the expected convention.

## Refresh only while visible

Use a self-scheduling timeout instead of `setInterval`, so slow refreshes do not overlap:

```js
let visible = false;
let refreshTimer = null;

function stopPolling() {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = null;
}

async function poll() {
  stopPolling();
  if (!visible) return;
  try {
    await refresh();
  } finally {
    if (visible) refreshTimer = window.setTimeout(poll, 10_000);
  }
}

window.mxwl.onVisibility((nextVisible) => {
  visible = nextVisible;
  if (visible) void poll();
  else stopPolling();
});

addEventListener("pagehide", stopPolling);
```

Add a minimum freshness window if context and visibility events can both trigger `refresh()` in
quick succession.

## Store versioned state per workspace

Plugin storage is shared across the plugin ID, so make scope and schema explicit:

```js
const STORAGE_SCHEMA = 2;

function storageKey(context, name) {
  return `${context.contributionId}:${name}:${context.workspace.id}`;
}

async function loadPreferences(context) {
  const key = storageKey(context, "preferences");
  const value = await window.mxwl.call("storage.get", { key });

  if (!value || typeof value !== "object") {
    return { schema: STORAGE_SCHEMA, fontSize: 13, view: "rendered" };
  }

  if (value.schema === 1) {
    return {
      schema: STORAGE_SCHEMA,
      fontSize: Number(value.textSize) || 13,
      view: "rendered",
    };
  }

  return {
    schema: STORAGE_SCHEMA,
    fontSize: Math.min(24, Math.max(10, Number(value.fontSize) || 13)),
    view: value.view === "source" ? "source" : "rendered",
  };
}

async function savePreferences(context, preferences) {
  await window.mxwl.call("storage.set", {
    key: storageKey(context, "preferences"),
    value: { ...preferences, schema: STORAGE_SCHEMA },
  });
}
```

Debounce high-frequency writes such as resize or keystroke state. Stay far below the 256 KiB total
budget and never store secrets.

## Fetch a task API safely

The broker intentionally allows any HTTP(S) destination once `network:fetch` is granted. Add your
own destination and response policy:

```js
const API_ORIGIN = "https://tasks.example.test";

function taskUrl(path, query = {}) {
  const url = new URL(path, API_ORIGIN);
  if (url.origin !== API_ORIGIN) throw new Error("Unexpected task API origin");
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null)
      url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function taskRequest(path, options = {}) {
  const response = await window.mxwl.call("network.fetch", {
    url: taskUrl(path, options.query),
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (!response.ok) {
    throw new Error(`Task service returned HTTP ${response.status}`);
  }

  let data;
  try {
    data = JSON.parse(response.body);
  } catch {
    throw new Error("Task service returned invalid JSON");
  }
  return data;
}
```

Validate the resulting object before rendering it. Avoid automatic retries for POST, PUT, PATCH,
or DELETE: an SDK timeout does not guarantee the server did not apply the first request.

API v1 has no secret store. Do not check a bearer token into JavaScript or persist one in plugin
storage. Prefer service-side, short-lived, or existing-machine authentication patterns.

## Build a changed-file inbox

```js
async function loadChanges() {
  const snapshot = await window.mxwl.call("git.changes");
  return {
    branch: snapshot.branch,
    totals: `+${snapshot.additions} −${snapshot.deletions}`,
    files: snapshot.files.map((file) => ({
      ...file,
      label: file.oldPath ? `${file.oldPath} → ${file.path}` : file.path,
      stats:
        file.additions === null || file.deletions === null
          ? "binary"
          : `+${file.additions} −${file.deletions}`,
    })),
  };
}

async function openDiff(path) {
  const diff = await window.mxwl.call("git.diff", { path });
  if (diff.binary) return { kind: "binary", path };
  return {
    kind: "text",
    path,
    before: diff.oldText || "",
    after: diff.newText || "",
    hunks: diff.hunks,
  };
}
```

The API provides before/after text suitable for your own unified renderer, split renderer, CodeMirror 6,
or another locally bundled viewer. Keep bundle chunks under the 2 MiB per-asset limit.

### Stage with stale-state recovery

```js
async function stageHunk(path, hunkId) {
  try {
    await window.mxwl.call("git.stageHunk", { path, hunkId });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : String(reason);
    if (message.includes("refresh and try again")) {
      await openDiff(path);
    }
    throw reason;
  } finally {
    await loadChanges();
  }
}
```

Hunk IDs are snapshots, not durable identifiers. Disable stage controls while a mutation runs and
always refresh changes afterward.

## Open the pull-request flow

```js
async function openPullRequest() {
  const url = await window.mxwl.call("git.pullRequestUrl");
  return window.mxwl.call("browser.open", { url });
}
```

This needs both `git:read` and `browser:open`. Display the destination first if branch or remote
metadata can be surprising.

## Hand selected content to the active agent

Keep prompts bounded and show exactly what the plugin will send:

````js
function buildReviewPrompt({ path, selectedText }) {
  const excerpt = selectedText.slice(0, 20_000);
  return [
    `Review the selected content from ${path}.`,
    "Explain concrete risks, then propose the smallest safe fix and verify it.",
    "",
    "```",
    excerpt,
    "```",
  ].join("\n");
}

async function askAgent(selection) {
  const text = buildReviewPrompt(selection);
  await window.mxwl.call("agent.prompt", { text });
}
````

Treat this as a handoff rather than a background RPC. Agent work can exceed the SDK timeout and
continue in mxwl after the plugin promise rejects. Do not automatically resubmit.

## Write a project file without clobbering blindly

API v1 has no compare-and-swap primitive, so use read-review-write-refresh:

```js
async function saveProjectConfig(path, nextConfig) {
  let existing = "";
  try {
    existing = await readText(path);
  } catch {
    // A missing optional config starts empty. Surface other errors in production code.
  }

  const next = `${JSON.stringify(nextConfig, null, 2)}\n`;
  if (existing === next) return { changed: false };

  const accepted = await showWritePreview({
    path,
    before: existing,
    after: next,
  });
  if (!accepted) return { changed: false };

  // Re-read here and compare with `existing` if concurrent edits are plausible.
  await window.mxwl.call("files.write", { path, content: next });
  return { changed: true };
}
```

The parent directory must already exist. Make overwrites explicit; there is no host transaction or
automatic backup.

## Share code across several contributions

Two entries can import a common browser module:

```html
<!-- tasks.html -->
<script src="/__mxwl/sdk/v1.js"></script>
<script type="module" src="./tasks.js"></script>
```

```js
// shared.js
export function currentScope(context) {
  return `${context.pluginId}:${context.contributionId}:${context.workspace.id}`;
}

export function subscribe(start) {
  let stopCurrent = null;
  const stopContext = window.mxwl.onContext((context) => {
    stopCurrent?.();
    stopCurrent = start(context) || null;
  });
  return () => {
    stopCurrent?.();
    stopContext();
  };
}
```

Every module must remain a local plugin asset. Both contributions share origin and storage, so key
state with `contributionId` when it is not intentionally shared.

## Make a panel feel native without copying mxwl

Start with system fonts and dark color-scheme support, then build a responsive layout around
available width:

```css
:root {
  color-scheme: dark;
  font:
    12px/1.45 Inter,
    ui-sans-serif,
    system-ui,
    sans-serif;
  background: #09090b;
  color: #e4e4e7;
}

* {
  box-sizing: border-box;
}
body {
  margin: 0;
  min-width: 0;
}
.shell {
  min-height: 100vh;
  padding: 12px;
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}

@media (min-width: 720px) {
  .shell {
    padding: 16px;
  }
  .grid {
    grid-template-columns: minmax(220px, 0.7fr) minmax(0, 1.3fr);
  }
}

button,
input,
select,
textarea {
  font: inherit;
}
:focus-visible {
  outline: 2px solid #8b5cf6;
  outline-offset: 2px;
}
```

Test the tool both in a narrow quadrant and maximized. Preserve native browser zoom behavior; avoid
pixel-locked canvases or global keyboard handlers that intercept mxwl shortcuts unnecessarily.

## Choose the next pattern

- Building from scratch: [authoring guide](/docs/plugins/)
- Looking up a result shape or hard limit: [API reference](/docs/plugin-api/)
- Preparing a repository or release: [testing and distribution](/docs/plugin-testing/)
- Handling credentials, HTML, or network access: [security model](/docs/plugin-security/)
