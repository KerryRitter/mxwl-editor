# Develop, test, and distribute plugins

mxwl links plugins from a filesystem path, so the normal development loop is fast: build into a
stable directory, reload the plugin catalog, and test inside a real local or SSH workspace. This
guide turns that loop into something repeatable enough to share with a team.

For the programming model, begin with [Build a plugin](./plugins.md). For method contracts, use the
[API reference](./plugin-api.md).

## Recommended repository shape

### Buildless plugin

```text
mxwl-plugin-notes/
├── mxwl.plugin.json
├── index.html
├── index.js
├── styles.css
├── mxwl-plugin-sdk.d.ts
├── test/
├── README.md
└── LICENSE
```

This is excellent for personal tools and auditable internal workflows. The installed path is the
repository root.

### Bundled plugin

```text
mxwl-plugin-delivery/
├── mxwl.plugin.json
├── src/
├── test/
├── dist/
│   ├── index.html
│   ├── assets.js
│   └── assets.css
├── package.json
├── README.md
└── LICENSE
```

The manifest entry points into `dist/`. mxwl still links the repository root because that is where
`mxwl.plugin.json` lives. Ensure a fresh clone contains or can build every referenced asset.

Do not point mxwl at framework source that depends on a dev server, Node.js resolution, or remote
CDN modules. The final runtime is a static browser application under a restrictive CSP.

## Development loop

1. Create or clone the plugin directory.
2. If necessary, run its build in watch mode.
3. Link the directory once through **Settings → Plugins → Install path**.
4. Review and enable the plugin.
5. Make a change.
6. Choose **Settings → Plugins → Reload**.
7. Reopen the tool and verify narrow, maximized, hidden/visible, and workspace-switch behavior.

Reload re-reads manifests and assets in place. The host adds a new resource revision and sends
`Cache-Control: no-store`, so you should not rename output files merely to defeat the browser cache.

If permissions changed, Reload disables the plugin and marks it for permission review. Re-enable it
after reviewing the new set. If only code or the plugin version changed, it remains enabled.

### Fast static checks

For a plain JavaScript plugin:

```bash
node --check index.js
node -e "JSON.parse(require('node:fs').readFileSync('mxwl.plugin.json', 'utf8'))"
```

JSON parsing is only a syntax check; installing/reloading through mxwl performs the authoritative
manifest validation.

For checked JavaScript, copy [`sdk/mxwl-plugin-sdk.d.ts`](../sdk/mxwl-plugin-sdk.d.ts) into the
plugin and reference it:

```js
// @ts-check
/// <reference path="./mxwl-plugin-sdk.d.ts" />
```

Then add a local `jsconfig.json`:

```json
{
  "compilerOptions": {
    "checkJs": true,
    "noEmit": true,
    "strict": true,
    "lib": ["ES2022", "DOM"]
  },
  "include": ["*.js", "mxwl-plugin-sdk.d.ts"]
}
```

Run `npx tsc -p jsconfig.json` if TypeScript is a development dependency. The declaration types
the SDK lifecycle but API v1 host methods remain string-dispatched; define method result types in
your code and validate untrusted data at runtime.

### Inspect asset sizes

Every runtime asset is limited to 2 MiB. Check build output before linking or releasing:

```bash
find . -type f -size +1900k -not -path './.git/*' -print
```

Code-split heavy editors and Markdown/rendering libraries. Fonts and source maps are frequent
surprises. Only files requested at runtime need to fit the host limit, but keeping release output
small improves load and review time.

## Debug in mxwl

### Start with an in-tool diagnostic surface

Do not make the developer console the only place errors exist:

```js
addEventListener("error", (event) => showError(event.error || event.message));
addEventListener("unhandledrejection", (event) => showError(event.reason));

function showError(reason) {
  const node = document.querySelector('[role="alert"]');
  node.textContent = reason instanceof Error ? reason.message : String(reason);
  node.hidden = false;
}
```

Show loading, missing-data, disconnected, permission, timeout, and malformed-response states in the
tool itself. Users should be able to report what failed without opening development tools.

### Application DevTools

Use **View → Toggle Developer Tools** for mxwl's renderer, then select the plugin frame in Chromium's
execution-context selector. Plugin `console` output, uncaught errors, CSP violations, loaded assets,
and DOM are visible there. In development builds, the application renderer DevTools opens
automatically.

The bottom **Dev Tools** tab belongs to the embedded workspace browser. It does not inspect plugin
iframes in the top-right deck.

### Diagnose from the catalog

Settings displays invalid linked entries instead of silently dropping them. Common catalog errors
include:

- unsupported `apiVersion`;
- reserved or malformed plugin ID;
- invalid semantic version;
- empty `workspaceTools`;
- duplicate contribution IDs;
- unknown icon or permission;
- missing, absolute, escaping, or non-HTML entry;
- entry symlink outside the plugin directory;
- duplicate linked plugin ID;
- saved path that no longer exists.

Fix the external directory and choose **Reload**. You usually do not need to unlink and reinstall.

## Unit-test application logic

Keep parsing, filtering, state migration, URL construction, and rendering models in modules that do
not call the bridge directly. Pass a small client interface into integration code:

```js
// artifacts.js
export function createArtifactService(client) {
  return {
    async list(ticket) {
      if (!/^[A-Z][A-Z0-9]+-\d+$/.test(ticket)) return [];
      return client.call("files.readDirectory", {
        path: `.zipper-agent/local/${ticket}`,
      });
    },

    async read(path) {
      const result = await client.call("files.read", { path });
      if (result.encoding !== "utf8") throw new Error("Artifact is binary");
      return result.content;
    },
  };
}
```

Now tests need no Electron process:

```js
import { describe, expect, it, vi } from "vitest";
import { createArtifactService } from "../artifacts.js";

describe("artifact service", () => {
  it("reads the bounded ticket directory", async () => {
    const call = vi
      .fn()
      .mockResolvedValue([
        {
          name: "QA_PREP.md",
          path: ".zipper-agent/local/PROJ-42/QA_PREP.md",
          isDirectory: false,
        },
      ]);
    const service = createArtifactService({ call });

    await expect(service.list("PROJ-42")).resolves.toHaveLength(1);
    expect(call).toHaveBeenCalledWith("files.readDirectory", {
      path: ".zipper-agent/local/PROJ-42",
    });
  });

  it("rejects path-shaped ticket input before calling the host", async () => {
    const call = vi.fn();
    const service = createArtifactService({ call });

    await expect(service.list("../secret")).resolves.toEqual([]);
    expect(call).not.toHaveBeenCalled();
  });
});
```

Test at least:

- empty and missing directories;
- binary file responses;
- malformed JSON/Markdown/API payloads;
- stale context generations;
- storage schema migration;
- response and discovery caps;
- hostile HTML in every rendered text field;
- network error, non-2xx, timeout, and duplicate-submit behavior;
- stale Git hunk recovery;
- a 30-second client timeout where a non-idempotent operation may still complete.

## Test the UI with a fake SDK

Browser UI tests can install a small `window.mxwl` test double before loading application code:

```js
// test/mxwl-mock.js
export function installMxwlMock({ context, responses = {} }) {
  const contextListeners = new Set();
  const visibilityListeners = new Set();
  const calls = [];

  const client = {
    apiVersion: 1,
    call: async (method, params = {}) => {
      calls.push({ method, params });
      if (!(method in responses))
        throw new Error(`No mock response for ${method}`);
      const response = responses[method];
      return typeof response === "function" ? response(params) : response;
    },
    getContext: () => context,
    isVisible: () => true,
    onContext: (listener) => {
      contextListeners.add(listener);
      queueMicrotask(() => listener(context));
      return () => contextListeners.delete(listener);
    },
    onVisibility: (listener) => {
      visibilityListeners.add(listener);
      queueMicrotask(() => listener(true));
      return () => visibilityListeners.delete(listener);
    },
  };

  Object.defineProperty(window, "mxwl", { value: Object.freeze(client) });
  return { calls, contextListeners, visibilityListeners };
}
```

With Vitest and jsdom, install the mock, create the expected DOM fixture, and dynamically import the
plugin module. With Playwright, inject the object through `page.addInitScript()` and serve the built
HTML from a tiny test server. The fake tests your UI contract; it does not replace a real mxwl smoke
test of the sandbox and broker.

## Run a host integration test

Host contributors can use the mxwl Electron Playwright fixture. The existing
[`e2e/plugins.spec.ts`](../e2e/plugins.spec.ts) is the canonical example: it creates isolated user
data, copies a plugin into a temporary external directory, links its path, enables it, interacts
through the iframe, verifies permission denial, reloads after a manifest change, and unlinks without
deleting source.

From an mxwl checkout:

```bash
npm run e2e -- e2e/plugins.spec.ts
```

The fixture uses a throwaway local workspace and user-data directory, so it does not touch the
developer's real hosts, sessions, grants, or storage.

An external plugin repository has three practical integration-test choices:

1. Keep fast unit/UI tests locally and perform a documented manual smoke test against the minimum
   supported mxwl release.
2. Add mxwl as a CI checkout and adapt its temporary-directory Playwright fixture to copy your
   release output.
3. Maintain a tiny test-only host implementing the `window.mxwl` contract, then retain at least one
   real mxwl smoke test before release.

Do not reach through `window.parent`, mxwl renderer DOM, or `window.api` in tests. Those are not
plugin APIs and are intentionally inaccessible in production.

## Manual release matrix

Before cutting a release, test:

| Scenario              | Expected result                                                         |
| --------------------- | ----------------------------------------------------------------------- |
| First path install    | Catalog shows plugin disabled and exact requested permissions           |
| Enable                | All contributions appear in manifest order relative to other tabs       |
| Narrow pane           | Primary content remains usable without horizontal page scrolling        |
| Maximized pane        | Layout uses available space without oversized text/controls             |
| Switch tool/workspace | Background work pauses; new context cannot be overwritten by stale data |
| Local workspace       | File and Git calls work with relative paths                             |
| SSH workspace         | No code assumes local filesystem paths or Node access                   |
| Missing optional data | Useful empty state, not a crash loop                                    |
| Disconnect/reconnect  | Status and retry behavior are clear                                     |
| Reload                | New assets appear without relinking                                     |
| Permission change     | Plugin disables and requests review                                     |
| Disable/enable        | Durable state restores; subscriptions and timers do not duplicate       |
| App restart           | Linked path and non-secret persisted state restore                      |
| Unlink                | Source stays on disk; contribution disappears                           |

Also test malicious or malformed content relevant to the plugin: HTML-like task names, extremely
long Markdown lines, unexpected encodings, missing Git upstream, binary diffs, non-JSON HTTP bodies,
and service error pages.

## Distribution model

API v1 has no marketplace or URL installer. Distribution means giving users a trusted directory
they can link.

### Git repository

Recommended for developers and teams:

```bash
git clone https://example.test/acme/mxwl-plugin-delivery.git
cd mxwl-plugin-delivery
npm ci
npm run build
```

The user pastes the repository path into **Settings → Plugins**. Updating is an explicit Git pull
and rebuild followed by **Reload**. Pin dependencies and document the supported mxwl/API version.

If non-developers are the audience, commit audited build output or provide a release archive so
they do not need a Node toolchain.

### Release archive

Publish a `.zip` or `.tar.gz` whose extracted root contains `mxwl.plugin.json` and every referenced
asset. Users extract it to a stable location and link that directory.

Good:

```text
mxwl-plugin-delivery-1.4.0/
├── mxwl.plugin.json
├── dist/index.html
├── dist/app.js
├── dist/app.css
├── README.md
└── LICENSE
```

Avoid an extra unannounced wrapper directory that causes users to select a folder without the
manifest. Publish checksums and release notes where the distribution channel supports them.

### Shared team directory

A read-only, centrally managed directory can make internal deployment simple, but every update to
that directory changes running plugin code after the next reload/application launch. Restrict write
access, retain versioned releases, and make rollback possible.

### Paths and identity

- The install path may be a directory or the exact `mxwl.plugin.json` file.
- `~` expansion is supported.
- mxwl stores the canonical directory and loads it in place.
- Moving or deleting it produces an invalid catalog entry until the path is restored or unlinked.
- Two linked directories cannot claim the same plugin ID.
- During migration, an explicitly linked plugin wins over an obsolete managed app-data copy with
  the same ID.
- Unlink removes the saved location and grants; it does not delete source or plugin storage.

## Versioning and migrations

The manifest has two independent version concepts:

- `apiVersion: 1` selects the mxwl protocol.
- `version: "1.4.0"` is your plugin release.

Use semantic versioning for user expectations:

- patch: fixes that preserve behavior and storage shape;
- minor: backward-compatible features or optional permissions;
- major: changed workflow, removed behavior, or incompatible plugin-owned data.

Any permission-set change requires reapproval regardless of semantic version. Call it out near the
top of release notes.

Version persisted data separately from the plugin:

```js
const CURRENT_SCHEMA = 3;

function migrate(value) {
  if (!value || typeof value !== "object")
    return { schema: CURRENT_SCHEMA, filters: {} };
  if (value.schema === 1) value = migrateOneToTwo(value);
  if (value.schema === 2) value = migrateTwoToThree(value);
  if (value.schema !== CURRENT_SCHEMA)
    return { schema: CURRENT_SCHEMA, filters: {} };
  return value;
}
```

Make migrations idempotent, preserve a safe fallback, and test upgrading from every version you
claim to support. Unlink/relink may reveal old storage because unlinking intentionally preserves it.

## Release checklist

- [ ] `mxwl.plugin.json` is at the linked root and parses as strict JSON.
- [ ] IDs, version, icons, entries, and permissions pass a real mxwl Reload.
- [ ] Every entry and runtime asset stays under the plugin root.
- [ ] No runtime asset exceeds 2 MiB.
- [ ] No remote script, CDN dependency, inline script, or dev-server URL remains.
- [ ] The plugin starts from a fresh clone/archive with documented commands.
- [ ] Unit/UI tests pass and the manual matrix covers local plus SSH where applicable.
- [ ] Permission additions/removals are explained in release notes.
- [ ] Storage schema migrations and downgrade behavior are understood.
- [ ] No tokens, passwords, private paths, internal payloads, or sourcemap secrets ship.
- [ ] Dependency lockfile, license, changelog, screenshots, and support contact are included.
- [ ] The README states the minimum mxwl version and plugin API version.
- [ ] The release directory is stable enough that saved linked paths will not break unexpectedly.

## Troubleshooting

### The plugin does not appear

- Confirm the selected directory directly contains `mxwl.plugin.json`.
- Open Settings and read the invalid plugin error.
- Check JSON syntax, API version, lowercase ID, semantic version, entries, icons, and permissions.
- Confirm every entry exists and is a relative `.html` path.
- Ensure another linked directory does not use the same plugin ID.
- Choose **Reload** after fixing it.

### The plugin appears but has no tab

- User plugins start disabled; enable it after reviewing permissions.
- A permission-set change disables an enabled plugin until reapproval.
- Confirm `contributes.workspaceTools` is non-empty.
- If no workspace is open, there is no workspace tool deck to host it.

### The tab is blank

- Open application DevTools and check frame console/CSP errors.
- Load `/__mxwl/sdk/v1.js` before application code.
- Move inline JavaScript and inline event handlers into local `.js` files.
- Remove remote scripts, modules, fonts, and images.
- Verify asset paths are relative to the entry document and filenames match case exactly.
- Check each loaded asset is below 2 MiB and not a symlink outside the plugin root.

### `window.mxwl` is undefined

The SDK script did not load or ran after application code. Use this order:

```html
<script src="/__mxwl/sdk/v1.js"></script>
<script src="./index.js"></script>
```

Opening `index.html` directly in a normal browser does not provide the host-served SDK. Use a test
double for browser-only development.

### A call says the plugin lacks permission

Add the exact permission to the manifest, Reload, review the changed permission set, and enable the
plugin again. JavaScript cannot request or elevate permissions at runtime.

### A file is missing from `files.list`

That method is capped and follows hide rules. For a known hidden application directory, call
`files.readDirectory` on its explicit relative path and recurse within strict bounds.

### Direct `fetch()` fails

The CSP sets `connect-src 'none'`. Declare `network:fetch` and use
`window.mxwl.call('network.fetch', …)`. Reapproval is required after adding the permission.

### Changes do not show after editing

Choose **Settings → Plugins → Reload**. If the plugin has a build step, verify it wrote the files
referenced by the manifest rather than only updating source. Inspect the actual served frame in
application DevTools.

### A write, push, HTTP mutation, or prompt timed out

The SDK stops waiting after 30 seconds but does not cancel the host operation. Refresh observable
state before retrying. Never assume a non-idempotent operation failed merely because the plugin
promise rejected.

Continue with the [Security model](./plugin-security.md) before distributing a plugin that combines
workspace reads, network access, agent prompts, or write operations.
