#!/bin/bash
# Stage native dependencies that electron-builder cannot see on its own.
#
# In this bun monorepo the Claude Agent SDK and ripgrep are hoisted to the
# ROOT node_modules, but electron-builder runs from apps/electron/ and its
# `extraResources` globs are resolved relative to that directory. Anything not
# copied here is SILENTLY skipped by electron-builder, producing an app that
# crashes at launch with "Cannot find module '@anthropic-ai/claude-agent-sdk'".
#
# This script is the single source of truth for that staging. It is called by
# both build-dmg.sh (signed release) and build-dmg-local.sh (unsigned local),
# so the two paths can never drift.
#
# Usage: stage-native-deps.sh <arm64|x64>
set -e

ARCH="${1:-arm64}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$(dirname "$ELECTRON_DIR")")"

require_path() {
    local path="$1"; local description="$2"; local hint="$3"
    if [ ! -e "$path" ]; then
        echo "ERROR: $description not found at $path"
        [ -n "$hint" ] && echo "$hint"
        exit 1
    fi
}

echo "=== Staging native deps for darwin-${ARCH} ==="

# Clean prior staging so a stale/wrong-arch binary can never leak into a build.
rm -rf "$ELECTRON_DIR/node_modules/@anthropic-ai"
rm -rf "$ELECTRON_DIR/node_modules/@vscode/ripgrep"

# 1. Claude Agent SDK core (thin, universal: sdk.mjs + types).
SDK_SOURCE="$ROOT_DIR/node_modules/@anthropic-ai/claude-agent-sdk"
require_path "$SDK_SOURCE" "SDK core" "Run 'bun install' from the repository root first."
echo "Copying SDK core..."
mkdir -p "$ELECTRON_DIR/node_modules/@anthropic-ai"
cp -r "$SDK_SOURCE" "$ELECTRON_DIR/node_modules/@anthropic-ai/"

# 2. The matching arch's native binary package, staged under the stable alias
#    `claude-agent-sdk-binary/` that electron-builder.yml and the runtime
#    resolver (runtime-resolver.ts) both reference. If the host arch matches
#    the target, bun install already placed it; otherwise npm-fetch the tarball.
SDK_BIN_PKG="claude-agent-sdk-darwin-${ARCH}"
SDK_BIN_SOURCE="$ROOT_DIR/node_modules/@anthropic-ai/${SDK_BIN_PKG}"
if [ ! -d "$SDK_BIN_SOURCE" ]; then
    echo "Cross-arch build: ${SDK_BIN_PKG} not in node_modules — fetching from npm..."
    SDK_VERSION=$(node -p "require('$ROOT_DIR/package.json').dependencies['@anthropic-ai/claude-agent-sdk']" | tr -d '"')
    PKG_TMP=$(mktemp -d)
    trap "rm -rf $PKG_TMP" RETURN
    (
        cd "$PKG_TMP"
        npm pack "@anthropic-ai/${SDK_BIN_PKG}@${SDK_VERSION}" >/dev/null
        TARBALL=$(ls anthropic-ai-*.tgz | head -1)
        tar -xzf "$TARBALL"
    )
    mkdir -p "$SDK_BIN_SOURCE"
    cp -r "$PKG_TMP/package/." "$SDK_BIN_SOURCE/"
fi
require_path "$SDK_BIN_SOURCE" "SDK native binary package (${SDK_BIN_PKG})" \
  "Run 'bun install' from the repository root, or check your network for the npm cross-fetch."

echo "Staging SDK native binary as claude-agent-sdk-binary alias..."
ALIAS_DEST="$ELECTRON_DIR/node_modules/@anthropic-ai/claude-agent-sdk-binary"
rm -rf "$ALIAS_DEST"
mkdir -p "$ALIAS_DEST"
cp -r "$SDK_BIN_SOURCE/." "$ALIAS_DEST/"
chmod +x "$ALIAS_DEST/claude"

# Sanity check: native binary should be ~210 MB. A tiny file means a botched copy.
BIN_SIZE=$(stat -f%z "$ALIAS_DEST/claude" 2>/dev/null || stat -c%s "$ALIAS_DEST/claude")
if [ "$BIN_SIZE" -lt 50000000 ]; then
    echo "ERROR: claude binary at $ALIAS_DEST/claude is only ${BIN_SIZE} bytes (expected ~210 MB)"
    exit 1
fi
echo "  Native binary: $((BIN_SIZE / 1024 / 1024)) MB"

# 3. ripgrep (search service needs the binary directly since SDK 0.2.113).
RG_SOURCE="$ROOT_DIR/node_modules/@vscode/ripgrep"
require_path "$RG_SOURCE" "@vscode/ripgrep" "Run 'bun install' and 'bun pm trust @vscode/ripgrep' first."
require_path "$RG_SOURCE/bin/rg" "ripgrep binary" "@vscode/ripgrep postinstall did not run."
echo "Copying @vscode/ripgrep..."
mkdir -p "$ELECTRON_DIR/node_modules/@vscode"
cp -r "$RG_SOURCE" "$ELECTRON_DIR/node_modules/@vscode/"

# 4. Network interceptor sources (used by the Pi subprocess, which runs on Bun
#    and accepts --preload; the Claude native binary does not).
INTERCEPTOR_SOURCE="$ROOT_DIR/packages/shared/src/unified-network-interceptor.ts"
require_path "$INTERCEPTOR_SOURCE" "Interceptor" "Ensure packages/shared/src/unified-network-interceptor.ts exists."
echo "Copying interceptor (for Pi subprocess)..."
mkdir -p "$ELECTRON_DIR/packages/shared/src"
cp "$INTERCEPTOR_SOURCE" "$ELECTRON_DIR/packages/shared/src/"
for dep in interceptor-common.ts feature-flags.ts interceptor-request-utils.ts; do
  if [ -f "$ROOT_DIR/packages/shared/src/$dep" ]; then
    cp "$ROOT_DIR/packages/shared/src/$dep" "$ELECTRON_DIR/packages/shared/src/"
  fi
done

echo "=== Native deps staged ==="
