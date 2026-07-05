#!/bin/bash
# Build a WORKING local macOS .dmg with no Apple Developer identity.
#
# Why this exists (two failure modes the plain `electron:dist:*` scripts hit):
#
#   1. Missing native deps — those scripts run electron-builder directly and
#      skip the SDK/ripgrep staging, so the app launches and immediately
#      crashes with "Cannot find module '@anthropic-ai/claude-agent-sdk'".
#      Fixed by stage-native-deps.sh (shared with the signed build-dmg.sh).
#
#   2. Ad-hoc signing vs macOS provenance — on macOS 15+/26 the Electron
#      helper binaries carry a `com.apple.provenance` extended attribute that
#      `codesign` refuses ("resource fork, Finder information, or similar
#      detritus not allowed"). `xattr -cr` cannot remove it; only copying with
#      `ditto --noextattr` strips it. So we let electron-builder produce the
#      UNSIGNED .app (identity=null), clean it with ditto, ad-hoc sign it
#      ourselves (arm64 requires at least an ad-hoc signature to execute), then
#      build the dmg with hdiutil.
#
# The signed release path (build-dmg.sh) is untouched — this is additive.
#
# Usage: build-dmg-local.sh [arm64|x64]
set -e

ARCH="${1:-arm64}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$ELECTRON_DIR")")"

VOL_NAME="Craft Agents"
APP_NAME="Craft Agents.app"
STAGE_DIR="$ELECTRON_DIR/release/local-dmg-stage"
UNPACKED_APP="$ELECTRON_DIR/release/mac-$([ "$ARCH" = "arm64" ] && echo "arm64" || echo "x64")/$APP_NAME"
OUT_DMG="$ELECTRON_DIR/release/Craft-Agents-local-${ARCH}.dmg"

echo "=== Building local unsigned Craft Agents DMG (${ARCH}) ==="

# 1. Install deps (root) so the hoisted SDK/ripgrep exist to stage.
echo "Installing dependencies..."
cd "$ROOT_DIR"
bun install

# 2. Stage native deps into apps/electron/node_modules (shared with build-dmg.sh).
bash "$ELECTRON_DIR/scripts/stage-native-deps.sh" "$ARCH"

# 3. Build the Electron bundles.
echo "Building Electron app..."
cd "$ROOT_DIR"
bun run electron:build

# 4. Package the app UNSIGNED (identity=null) as a plain directory target.
#    We sign it ourselves afterwards; letting electron-builder ad-hoc sign here
#    is what trips over com.apple.provenance.
echo "Packaging unsigned .app with electron-builder..."
cd "$ELECTRON_DIR"
rm -rf "$ELECTRON_DIR/release/mac-arm64" "$ELECTRON_DIR/release/mac-x64"
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --${ARCH} \
    --config electron-builder.yml \
    -c.mac.identity=null

if [ ! -d "$UNPACKED_APP" ]; then
    echo "ERROR: expected unpacked app not found at $UNPACKED_APP"
    ls -la "$ELECTRON_DIR/release/" || true
    exit 1
fi

# 5. Strip extended attributes (incl. com.apple.provenance) by copying with
#    ditto --noextattr into a clean staging dir. xattr -cr cannot remove it.
echo "Cleaning extended attributes via ditto..."
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
ditto --norsrc --noextattr --noacl "$UNPACKED_APP" "$STAGE_DIR/$APP_NAME"

# 6. Ad-hoc sign (deep). arm64 needs at least an ad-hoc signature to run.
echo "Ad-hoc signing the app..."
codesign --force --deep --sign - "$STAGE_DIR/$APP_NAME"
codesign --verify --deep --strict "$STAGE_DIR/$APP_NAME"
echo "  Signature verified."

# 7. Build the dmg with a drag-to-Applications layout.
echo "Creating dmg..."
ln -sfn /Applications "$STAGE_DIR/Applications"
rm -f "$OUT_DMG"
hdiutil create -volname "$VOL_NAME" -srcfolder "$STAGE_DIR" -ov -format UDZO "$OUT_DMG" >/dev/null

echo ""
echo "=== Build Complete ==="
echo "DMG:  $OUT_DMG"
echo "Size: $(du -h "$OUT_DMG" | cut -f1)"
echo ""
echo "Note: unsigned/ad-hoc build. If Gatekeeper blocks first launch,"
echo "right-click the app in Applications and choose Open."
