# Agent panel

A chat tab next to Terminal / Dev logs / Dev Tools, talking to a coding agent
over [ACP](https://agentclientprotocol.com) instead of through a terminal. The
agent runs as a subprocess of the workspace host — local or over SSH — so a
remote workspace gets a remote agent with the right filesystem and PATH.

This is separate from [the AI layer](./ai.md), which orchestrates many CLIs
across many workspaces in PTYs. Use the AI layer to fan work out; use the Agent
tab to have one conversation with structured tool calls, diffs and a plan.

## Agents

ACP is a protocol, not a vendor, so anything that speaks it works. The launch
commands come from the ACP registry:

| Agent | Launch |
|---|---|
| Claude Code | `npx -y @agentclientprotocol/claude-agent-acp` |
| Codex | `npx -y @agentclientprotocol/codex-acp` |
| Cursor | `cursor-agent acp` |
| Gemini | `npx -y @google/gemini-cli --acp` |
| Kimi | `kimi acp` |
| GitHub Copilot | `npx -y @github/copilot --acp` |
| Qwen Code | `npx -y @qwen-code/qwen-code --acp` |
| OpenCode | `opencode acp` |
| Goose | `goose acp` |
| Custom | whatever you configure |

Each wraps a CLI you already log into normally — run `claude`, `codex`,
`cursor-agent login` etc. once in a terminal, and the ACP process inherits that
session. Agents that reject `session/new` because they are signed out surface
their auth methods as buttons instead of an error.

**Antigravity is not here**: it ships as an IDE with no ACP-capable CLI. Gemini
is the closest stand-in for that model family.

The launch line runs under a login shell with a PATH preamble in front of it
(`~/.local/bin`, bun, pnpm, volta, and `nvm.sh` sourced directly). A login shell
alone is not enough: nvm's setup lives in `~/.bashrc`, which returns before
reaching it when the shell is not interactive, so `npx` comes back **not found**
on precisely the machines that have it.

Settings → Agent picks the default and overrides the binary and arguments per
agent. Overriding the binary drops the registry's arguments — the ACP flag has to
be in your argument list, because a wrapper script handed a stray `acp` will not
thank you.

## Commands translate across agents

Every agent names the same ideas differently: Claude's `/compact` is somebody
else's `/compress`, `acceptEdits` is somebody else's `auto`. Nothing about which
agent has which name is hardcoded — ACP reports each agent's real commands at
runtime, and mxwl matches them against synonym sets
(`src/shared/agentCommands.ts`).

So typing `/compact` on an agent that only publishes `/compress` sends
`/compress`, and the composer says `sent as /compress` when it rewrote a line.
The reverse works on the next agent. Autocomplete searches names, canonical ids,
synonyms and descriptions, and shows the synonyms in grey so you can see what a
command is called elsewhere.

A name that matches nothing is sent through verbatim, so a command the agent
added after the palette was built still works.

Four commands are mxwl's own and always win over an agent command of the same
name, because they steer the panel rather than the conversation:

| Command | Effect |
|---|---|
| `/agent <name>` | Swap agents. Ends the old process |
| `/mode <plan\|ask\|auto\|full>` | Set the permission posture, in whatever the agent calls it |
| `/cancel` | Interrupt the turn (also **Esc**) |
| `/restart` | Fresh process and session — the fix for a hung or half-authenticated CLI |

Modes are canonicalised the same way. `/mode auto` finds `acceptEdits`,
`autoEdit`, `Accept edits` or whatever this agent named it; `/mode full` finds
`bypassPermissions` and friends. Both the id and the display name get a vote,
since agents sometimes publish `id: "1", name: "Accept edits"`.

## Skipping permission prompts

**Settings → Agent → Skip permission prompts**, on by default. Two things happen,
because agents split permissions two ways:

- the session opens in the agent's most permissive mode — `bypassPermissions`
  where it exists, `acceptEdits` where it does not, found by the same
  canonicalisation `/mode` uses;
- any `session/request_permission` that still arrives is answered with its
  `allow_always` option, or `allow_once` when that is all it offers.

The tool call still renders, so what ran is visible after the fact — but nothing
stops before it runs. The agent edits files and executes commands in the
workspace folder unattended, and on a remote workspace that is the remote box.
Turn it off in Settings for anything you would not hand a shell.

Some CLIs also gate this behind a launch flag (`--dangerously-skip-permissions`,
`--yolo`, `--full-auto`). mxwl does not inject those — the mode is the protocol's
own answer, and a stray flag on a wrapper script is not recoverable. Add one in
Settings → Agent → Arguments if your agent needs it.

## Saved conversations

Every transcript is written to
`<userData>/agent-transcripts/<id>.json` — debounced while a turn streams,
flushed when the agent closes or the conversation is cleared. The **history**
button in the panel header lists what was saved for the workspace's folder,
newest first; `cwd` is the key, because the workspace id is new on every open but
the folder is what you recognise. 100 conversations per folder are kept.

Opening one shows it read-only, with the composer parked and a **Back to live**
button. It is deliberately not loaded back into the running agent: a new ACP
session has no memory of an old one, and replaying it into the transcript would
claim otherwise.

## Composer

- **Enter** sends, **Shift+Enter** newlines, **Esc** stops a running turn.
- `/` at the start of a line opens the command palette.
- `@` anywhere opens file completion from the workspace.
- **Tab** or **Enter** accepts a suggestion, **Esc** dismisses it.

## What the panel renders

`session/update` notifications drive everything. Message chunks arrive
token-by-token and merge into one block per run, so text reads as paragraphs
rather than fragments. Thoughts collapse behind a one-line summary. Tool calls
show as a status line that expands into their content — diffs render inline with
a `+`/`−` count.

A plan tracker appears when the agent reports one, and the header shows a context
meter when the agent reports usage.

Permission requests park the turn and render as a card with the agent's own
options. Answering resolves the in-flight `session/request_permission`; closing
the panel or swapping agents cancels it rather than leaving the agent blocked.

## Filesystem and terminals

mxwl advertises `fs/read_text_file` and `fs/write_text_file`, so the agent reads
and writes through the editor's workspace connection. On a remote host that means
the agent's reads and mxwl's sftp agree, and `line`/`limit` slicing is honoured.

Terminal capability is deliberately **not** advertised: mxwl already gives the
agent a real terminal tab, and claiming the capability means owning process
lifetime too. Agents fall back to running commands themselves.

## Lifetime

Agent is the bottom panel's default tab, and showing it starts the agent named in
Settings — so opening a workspace starts one. The picker only appears while it is
starting, or after it failed. That happens once per workspace, so an
agent that exits stays exited until you hit Restart rather than respawning
behind you.

One agent per workspace, owned by main. Switching bottom tabs or workspace tabs
does not touch it — the panel stays mounted only to keep scroll position and a
half-typed message. Swapping agents kills the old process, since leaving it
running would burn a subscription seat. `before-quit` disposes every session,
which matters most on remote hosts where an orphan would sit until the SSH
connection times out.

An agent that dies shows its last stderr lines and a Restart button. An agent
that never answers `initialize` is treated as broken after 60s rather than hung.

## Tests

`src/shared/agentCommands.test.ts` and `src/shared/acpAgents.test.ts` cover the
translation tables and launch resolution. `e2e/agent-panel.spec.ts` drives the
panel against `e2e/fake-acp-agent.mjs`, a hand-rolled ACP agent on real stdio, so
the handshake, streaming, cancellation, permission round trip and command
translation are all exercised end to end.
