# Alpha / beta

mxwl is an **early alpha** desktop tool (`0.2.0-alpha.3`). Expect sharp edges. Use at your own risk on non-production machines first.

## Supported today

| Platform | Status |
|---|---|
| Linux (AppImage, deb) | Primary — best tested |
| macOS | Buildable (unsigned zip) — not notarized |
| Windows | Buildable (portable) — lightly tested |

## Known limitations

- No auto-update yet — install new releases manually
- Builds are **unsigned** (mac Gatekeeper / Win SmartScreen will warn)
- Linear / GitHub Issues / GitLab integrations are UI stubs
- Embedded DevTools can need a tab re-open if Chromium paints blank
- SSH reconnect gives up after ~12 failures (re-open the workspace)
- If OS keychain/`safeStorage` is unavailable, secrets are stored with an `insecure:` marker — prefer SSH agent
- MCP/CDP is loopback-only; still set an MCP token on shared remotes

## Feedback

Open GitHub issues with: OS, package type, host kind (local/SSH), and steps. Attach `crash.log` from the app userData folder when relevant.
