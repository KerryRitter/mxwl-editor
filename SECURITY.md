# Security

mxwl is a desktop app that holds SSH credentials and can open reverse tunnels. Treat it like a privileged local tool.

## Secrets

- SSH passwords / key passphrases and Jira/Bitbucket tokens are stored via Electron `safeStorage` when available.
- Prefer SSH agent or key auth over password auth.
- Do not commit `settings.json`, host stores, or custom presets that contain secrets.

## Network / MCP / CDP

- Chromium remote debugging binds to `127.0.0.1` only.
- MCP HTTP server listens on loopback.
- Reverse tunnels expose those ports on the **remote** host's loopback (`localhost` on the SSH box), not the public internet — assuming the remote firewall and SSH config are sane.
- Set an **MCP auth token** in Settings if untrusted processes on the remote host might hit `9223`.
- Disable MCP when you do not need agent control of the browser.

## Reporting

Report security issues privately to the maintainer (repo owner). Do not open public issues for exploitable tunnel / auth bugs until a fix is available.
