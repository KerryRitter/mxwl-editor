#!/usr/bin/env bash
set -euo pipefail

# Downloads the release AppImage, verifies its published checksum, and installs
# it for this user. Re-running safely replaces ~/.local/bin/mxwl.
release_version="${MXWL_VERSION:-0.2.0-alpha.4}"
asset_name="mxwl-${release_version}.AppImage"
release_url="https://github.com/KerryRitter/mxwl-editor/releases/download/v${release_version}"
bin_dir="${MXWL_BIN_DIR:-$HOME/.local/bin}"
desktop_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
download_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$download_dir"
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

case "$(uname -m)" in
  x86_64|amd64) ;;
  *)
    printf 'The release installer currently supports x86_64 Linux only. See the README for source builds.\n' >&2
    exit 1
    ;;
esac

require curl
require sha256sum

printf 'Downloading mxwl %s…\n' "$release_version"
curl --fail --location --retry 3 --output "$download_dir/$asset_name" \
  "$release_url/$asset_name"
curl --fail --location --retry 3 --output "$download_dir/$asset_name.sha256" \
  "$release_url/$asset_name.sha256"

if ! (cd "$download_dir" && sha256sum --check "$asset_name.sha256"); then
  printf 'mxwl checksum verification failed; nothing was installed.\n' >&2
  exit 1
fi

install -d "$bin_dir"
install -m 755 "$download_dir/$asset_name" "$bin_dir/mxwl"

# Use the same desktop-entry id as the deb package. A user entry takes
# precedence over /usr/share/applications, so the app menu stops launching an
# older system-wide mxwl installation.
install -d "$desktop_dir"
cat > "$desktop_dir/mxwl-editor.desktop" <<EOF
[Desktop Entry]
Name=mxwl
Exec="${bin_dir}/mxwl" %U
Terminal=false
Type=Application
Icon=applications-development
StartupWMClass=mxwl
Comment=Multi-workspace tool for local and SSH development
Categories=Development;
EOF

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$desktop_dir" >/dev/null 2>&1 || true
fi

printf 'Installed mxwl %s to %s\n' "$release_version" "$bin_dir/mxwl"
printf 'Updated desktop launcher: %s\n' "$desktop_dir/mxwl-editor.desktop"
case ":$PATH:" in
  *":$bin_dir:"*) printf 'Run: mxwl\n' ;;
  *) printf 'Add %s to PATH, then run: mxwl\n' "$bin_dir" ;;
esac
