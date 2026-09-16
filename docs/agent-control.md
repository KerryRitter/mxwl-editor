# Background runtime and agent control

mxwl can remain resident after its window closes. Workspaces, SSH connections, terminals, agents, notifications, and the control API stay alive; reopen the window from the tray. **Settings → Background runtime** controls this behavior and optional launch at login.

After a process or machine restart, mxwl restores the open workspaces and terminal tabs, then relaunches the agent that was attached to each workspace. Saved conversation transcripts remain available. ACP does not provide process-level resurrection, so an in-flight turn restarts as a fresh agent session rather than continuing at the exact interrupted instruction.

## Attention and notifications

The header bell has two views:

- **Attention queue** keeps completed, approval/authentication, and failed events until they are read or cleared.
- **Live agents** shows every agent across local and SSH hosts, sorted with blocked and failed work first.

Settings control popup delivery (bell only, in-app, desktop, or both), delay, sound, active-workspace suppression, and muted agent types. The delay requires a state to remain stable before mxwl alerts, which filters out brief transitions.

## CLI

The installed AppImage exposes the runtime client through the same `mxwl` command:

```bash
mxwl agent list
mxwl agent list --json
mxwl agent get PROJ-42 --json
mxwl agent focus PROJ-42
mxwl agent prompt PROJ-42 "Run the failing tests and fix them"
mxwl agent prompt PROJ-42 "Ship the fix" --wait
mxwl agent wait PROJ-42 --until idle,attention,error --timeout 600
```

A target may be a workspace ID, workspace title, issue key, or unique agent label. The desktop runtime must be running.

## Dashboard and API

Open the responsive dashboard from **Settings → Control API & mobile dashboard**. It can inspect live summaries, focus a workspace, send prompts, and answer permission requests.

The server listens only on `127.0.0.1:9233` by default. LAN access is opt-in and binds to all interfaces. Every `/api/*` route requires the generated bearer token:

```bash
curl -H "Authorization: Bearer $MXWL_TOKEN" http://127.0.0.1:9233/api/status
```

Treat that token like a password: an authenticated client can send instructions to agents and approve their requested actions. For phone access, prefer a trusted LAN, WireGuard/Tailscale, or another private network rather than forwarding the port to the public internet.
