# Host project settings

mxwl project behavior is **per host**, not a global preset.

Each host stores:

| Field | Purpose |
|---|---|
| `workspacesRoot` | Where to list folders |
| `folderFilter` | Optional glob / `/regex/` for discovery |
| `derive.folderPattern` | JS regex with named groups on folder basename |
| `derive.titleTemplate` / `browserUrlTemplate` / `issueKeyTemplate` | `${ticket}`, `${ticketNum}`, `${name}`, … |
| `services[]` | Dev logs panel (start/stop/restart/logs) |
| `hide[]` | Names hidden in the file tree |

**Clone host** duplicates connection + project settings (new id, label `… (copy)`).

## Who this is for

- **Git worktrees** — e.g. `~/Workspaces/myapp-PROJ-42`
- **Fresh clones per ticket**
- **Remote boxes** over SSH with the same folder naming

Configure via **Edit Host**. Global Settings is only credentials (Jira/Bitbucket), MCP token, and a fallback browser URL.

## Dev services example

```json
{
  "id": "api",
  "label": "API",
  "start": "npm run start:dev",
  "stop": "pkill -f 'my-api'",
  "restart": "npm run start:dev",
  "logs": "tail -f logs/api.log"
}
```

Empty `services` hides the Dev logs tab for that host.

## Folder pattern

```
^myapp-(?<ticket>[A-Z][A-Z0-9]*-\d+)$
```

| Folder | `${ticket}` | `${ticketNum}` |
|---|---|---|
| `myapp-PROJ-42` | `PROJ-42` | `42` |

Optional JSON templates under `presets/` (if present) are for manual import only — there are no built-in product presets.
