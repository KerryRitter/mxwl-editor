# Changelog

## 0.2.0-alpha.1

### Added
- Per-host project config: folder pattern, URL templates, Dev services, hide list
- Clone host
- Embedded Chromium DevTools (Elements / Network / …) in the bottom panel
- Secret encryption status banner; `enc:` / `insecure:` secret prefixes
- Unit tests for folder derive helpers; GitHub Actions CI
- Crash log file under app userData

### Changed
- Removed Zipper/Generic preset switching from the product path — config lives on each host
- Settings is credentials + fallbacks only
- SSH reconnect caps after repeated failures

### Alpha notes
- Linux packages are the primary distribution; mac/win unsigned builds optional
- See [ALPHA.md](./ALPHA.md)
