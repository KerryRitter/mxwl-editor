#!/usr/bin/env bash
set -euo pipefail

# Downloads the release AppImage, verifies its published checksum, and installs
# it for this user. Re-running safely replaces ~/.local/bin/mxwl.
release_version="${MXWL_VERSION:-0.2.0-alpha.5}"
asset_name="mxwl-${release_version}.AppImage"
release_url="https://github.com/KerryRitter/mxwl-editor/releases/download/v${release_version}"
bin_dir="${MXWL_BIN_DIR:-$HOME/.local/bin}"
desktop_dir="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
data_dir="${XDG_DATA_HOME:-$HOME/.local/share}"
local_appimage="${MXWL_APPIMAGE_PATH:-}"
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

if [[ -n "$local_appimage" ]]; then
  # Source builds can use the same launcher/icon installation as releases.
  if [[ ! -f "$local_appimage" ]]; then
    printf 'Local AppImage does not exist: %s\n' "$local_appimage" >&2
    exit 1
  fi
  cp "$local_appimage" "$download_dir/$asset_name"
else
  printf 'Downloading mxwl %s…\n' "$release_version"
  curl --fail --location --retry 3 --output "$download_dir/$asset_name" \
    "$release_url/$asset_name"
  curl --fail --location --retry 3 --output "$download_dir/$asset_name.sha256" \
    "$release_url/$asset_name.sha256"

  if ! (cd "$download_dir" && sha256sum --check "$asset_name.sha256"); then
    printf 'mxwl checksum verification failed; nothing was installed.\n' >&2
    exit 1
  fi
fi

chmod 755 "$download_dir/$asset_name"
# New builds bundle the exact branded icon set alongside the app. Extracting it
# from the verified AppImage keeps artwork and executable on the same version.
(cd "$download_dir" && "./$asset_name" --appimage-extract 'resources/branding/icons/*' >/dev/null)
icon_name="applications-development"
icon_source="$download_dir/squashfs-root/resources/branding/icons"
if [[ -d "$icon_source" ]]; then
  for size in 16 32 48 64 128 256 512 1024; do
    for icon in "$icon_source/icon_${size}.png" "$icon_source/icon_${size}x${size}.png"; do
      if [[ -f "$icon" ]]; then
        icon_dir="$data_dir/icons/hicolor/${size}x${size}/apps"
        install -d "$icon_dir"
        install -m 644 "$icon" "$icon_dir/mxwl-editor.png"
      fi
    done
  done
  icon_name="mxwl-editor"
else
  printf 'This older release has no bundled brand icons; using the generic launcher icon.\n'
fi

install -d "$bin_dir"
staged_appimage="$(mktemp "$bin_dir/.mxwl-install.XXXXXX")"
install -m 755 "$download_dir/$asset_name" "$staged_appimage"
mv -f "$staged_appimage" "$bin_dir/mxwl"

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
Icon=${icon_name}
StartupWMClass=mxwl-editor
Comment=Multi-workspace tool for local and SSH development
Categories=Development;
EOF

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$desktop_dir" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache --force --ignore-theme-index "$data_dir/icons/hicolor" >/dev/null 2>&1 || true
fi

printf 'Installed mxwl %s to %s\n' "$release_version" "$bin_dir/mxwl"
printf 'Updated desktop launcher: %s\n' "$desktop_dir/mxwl-editor.desktop"
case ":$PATH:" in
  *":$bin_dir:"*) printf 'Run: mxwl\n' ;;
  *) printf 'Add %s to PATH, then run: mxwl\n' "$bin_dir" ;;
esac
