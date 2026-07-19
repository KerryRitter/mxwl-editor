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

## Rules of the road

- Core stays host-agnostic. Zipper-specific strings belong in `presets/zipper.json` / `src/shared/presets/zipper.ts` only.
- Do not frame PRs as “make it more like VS Code.” Prefer features that keep browser + editor + terminal synced to one remote folder.
- Keep UI dense and keyboard-first (`Ctrl+K` palette).

## PR checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] No secrets in the diff
- [ ] Preset-only changes include an example JSON under `presets/`
