#!/bin/bash

set -e

VERSIONS_URL="https://agents.craft.do"
DOWNLOAD_DIR="$HOME/.craft-agent/downloads"

# Check for required dependencies
DOWNLOADER=""
if command -v curl >/dev/null 2>&1; then
    DOWNLOADER="curl"
elif command -v wget >/dev/null 2>&1; then
    DOWNLOADER="wget"
else
    echo "Either curl or wget is required but neither is installed" >&2
    exit 1
fi

# Check if jq is available (optional)
HAS_JQ=false
if command -v jq >/dev/null 2>&1; then
    HAS_JQ=true
fi

# Download function that works with both curl and wget
download_file() {
    local url="$1"
    local output="$2"
    
    if [ "$DOWNLOADER" = "curl" ]; then
        if [ -n "$output" ]; then
            curl -fsSL -o "$output" "$url"
        else
            curl -fsSL "$url"
        fi
    elif [ "$DOWNLOADER" = "wget" ]; then
        if [ -n "$output" ]; then
            wget -q -O "$output" "$url"
        else
            wget -q -O - "$url"
        fi
    else
        return 1
    fi
}

# Simple JSON parser for extracting values when jq is not available
get_json_value() {
    local json="$1"
    local key="$2"
    
    # Normalize JSON to single line
    json=$(echo "$json" | tr -d '\n\r\t' | sed 's/ \+/ /g')
    
    # Extract value using bash regex
    if [[ $json =~ \"$key\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
        echo "${BASH_REMATCH[1]}"
        return 0
    fi
    
    return 1
}

# Extract checksum from manifest for a specific platform
get_checksum_from_manifest() {
    local json="$1"
    local platform="$2"
    
    # Normalize JSON to single line
    json=$(echo "$json" | tr -d '\n\r\t' | sed 's/ \+/ /g')
    
    # Extract checksum for platform using bash regex
    if [[ $json =~ \"$platform\"[^}]*\"sha256\"[[:space:]]*:[[:space:]]*\"([a-f0-9]{64})\" ]]; then
        echo "${BASH_REMATCH[1]}"
        return 0
    fi
    
    return 1
}

# Detect platform
case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux) os="linux" ;;
    *) echo "Unsupported OS: $(uname -s). Only macOS and Linux are supported." >&2; exit 1 ;;
esac

case "$(uname -m)" in
    x86_64|amd64) arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

platform="${os}-${arch}"
echo "Detected platform: $platform"

mkdir -p "$DOWNLOAD_DIR"

# Get latest version
echo "Fetching latest version..."
latest_json=$(download_file "$VERSIONS_URL/latest")

if [ "$HAS_JQ" = true ]; then
    version=$(echo "$latest_json" | jq -r '.version // empty')
else
    version=$(get_json_value "$latest_json" "version")
fi

if [ -z "$version" ]; then
    echo "Failed to get latest version" >&2
    exit 1
fi

echo "Latest version: $version"

# Download manifest and extract checksum
echo "Fetching manifest..."
manifest_json=$(download_file "$VERSIONS_URL/$version/manifest.json")

if [ "$HAS_JQ" = true ]; then
    checksum=$(echo "$manifest_json" | jq -r ".binaries[\"$platform\"].sha256 // empty")
else
    checksum=$(get_checksum_from_manifest "$manifest_json" "$platform")
fi

# Validate checksum format (SHA256 = 64 hex characters)
if [ -z "$checksum" ] || [[ ! "$checksum" =~ ^[a-f0-9]{64}$ ]]; then
    echo "Platform $platform not found in manifest" >&2
    exit 1
fi

echo "Expected checksum: $checksum"

# Download tarball
tarball_url="$VERSIONS_URL/$version/$platform.tar.gz"
tarball_path="$DOWNLOAD_DIR/craft-$version-$platform.tar.gz"

echo "Downloading $tarball_url..."
if ! download_file "$tarball_url" "$tarball_path"; then
    echo "Download failed" >&2
    rm -f "$tarball_path"
    exit 1
fi

# Verify checksum
echo "Verifying checksum..."
if [ "$os" = "darwin" ]; then
    actual=$(shasum -a 256 "$tarball_path" | cut -d' ' -f1)
else
    actual=$(sha256sum "$tarball_path" | cut -d' ' -f1)
fi

if [ "$actual" != "$checksum" ]; then
    echo "Checksum verification failed" >&2
    echo "  Expected: $checksum" >&2
    echo "  Actual:   $actual" >&2
    rm -f "$tarball_path"
    exit 1
fi

echo "Checksum verified!"

# Extract to temporary directory
extract_dir="$DOWNLOAD_DIR/extract-$version"
rm -rf "$extract_dir"
mkdir -p "$extract_dir"

echo "Extracting archive..."
tar -xzf "$tarball_path" -C "$extract_dir"

binary_path="$extract_dir/craft"
chmod +x "$binary_path"

# Run craft install to set up the installation
echo ""
echo "Running craft install..."
"$binary_path" install

# Clean up
rm -rf "$tarball_path" "$extract_dir"

echo ""
echo "✅ Installation complete!"
echo ""
echo "Make sure ~/.local/bin is in your PATH:"
echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
echo ""
