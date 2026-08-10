#!/usr/bin/env bash
set -euo pipefail

# Builds the current main branch as an AppImage, then installs it for this user.
# Re-running this script safely replaces ~/.local/bin/mxwl with a fresh build.
repo_url="https://github.com/KerryRitter/mxwl-editor.git"
bin_dir="${MXWL_BIN_DIR:-$HOME/.local/bin}"
build_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$build_dir"
}
trap cleanup EXIT

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'mxwl installer requires %s\n' "$1" >&2
    exit 1
  fi
}

if [[ "$(uname -s)" != "Linux" ]]; then
  printf 'This installer currently supports Linux only. See the README for macOS and Windows builds.\n' >&2
  exit 1
fi

require git
require node
require npm

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if ((node_major < 20)); then
  printf 'mxwl requires Node.js 20 or newer; found %s.\n' "$(node --version)" >&2
  exit 1
fi

git clone --depth 1 --branch main "$repo_url" "$build_dir/mxwl-editor"
cd "$build_dir/mxwl-editor"
npm ci
npm run package:linux

appimage="$(find dist -maxdepth 1 -type f -name '*.AppImage' -print -quit)"
if [[ -z "$appimage" ]]; then
  printf 'The Linux package completed without producing an AppImage.\n' >&2
  exit 1
fi

install -d "$bin_dir"
install -m 755 "$appimage" "$bin_dir/mxwl"

printf 'Installed mxwl to %s\n' "$bin_dir/mxwl"
case ":$PATH:" in
  *":$bin_dir:"*) printf 'Run: mxwl\n' ;;
  *) printf 'Add %s to PATH, then run: mxwl\n' "$bin_dir" ;;
esac
