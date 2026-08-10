# Contributing

mxwl is experimental. Useful contributions:

1. **Presets** — JSON for your monorepo workflow (see [docs/presets.md](./docs/presets.md))
2. **Bug fixes** in SSH reconnect, SFTP edge cases, browser bounds
3. **macOS packaging** (unsigned is fine for now)
4. **Docs / GIFs** that show the SSH→folder→three-panes flow

## Dev

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

## Tests

```bash
npm test        # vitest — pure logic under src/**/*.test.ts
npm run e2e     # electron-vite build + Playwright against the real app
npm run e2e:only  # skip the rebuild (only if out/ is current)
```

The e2e suite launches the built `out/main/index.js` through
`playwright/_electron`, so it exercises real IPC, the preload bridge, node-pty
and Electron sessions. Each test gets a throwaway `--user-data-dir` and work
root (see `e2e/fixtures.ts`), so it never reads or writes your own hosts,
settings or sessions, and it never touches a remote host — the AI-run test
orchestrates against `localhost` with the per-ticket CLI stubbed to `echo`.

`npm run e2e` rebuilds first on purpose: Playwright runs the bundle in `out/`,
not the sources, so a fix that isn't built is a fix the suite can't see.

## Rules of the road

- Core stays host-agnostic. Zipper-specific strings belong in `presets/zipper.json` / `src/shared/presets/zipper.ts` only.
- Do not frame PRs as “make it more like VS Code.” Prefer features that keep browser + editor + terminal synced to one remote folder.
- Keep UI dense and keyboard-first (`Ctrl+K` palette).

## PR checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run e2e` passes if you touched main, preload or the AI runner
- [ ] `npm run build` passes
- [ ] No secrets in the diff
- [ ] Preset-only changes include an example JSON under `presets/`
