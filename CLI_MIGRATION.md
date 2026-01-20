# CLI Distribution Migration to /cli Prefix

## Overview

This migration reorganizes the CLI binary distribution to use a `/cli` prefix in S3, matching the existing `/electron` structure for better organization.

## Changes Made

### 1. CloudFlare Worker Router (`workers/agents-router/index.ts`)

**Before:**
- Served `/electron/*` from R2
- Served root-level version paths like `/1.0.18/darwin-arm64.tar.gz`
- Served `/install.sh` and `/latest` from root

**After:**
- Serves `/electron/*` from R2 (unchanged)
- Serves `/cli/*` from R2 (new)
- Everything else proxies to Pages marketing site

**New structure:**
```
/electron/               → Electron app distribution
  ├── install-app.sh     → Electron installer (macOS/Linux)
  ├── install-app.ps1    → Electron installer (Windows)
  ├── latest             → Latest Electron version
  └── {version}/         → Electron installers
      ├── Craft-Agent-*.dmg
      ├── Craft-Agent-*.exe
      └── Craft-Agent-*.AppImage

/cli/                    → CLI binary distribution
  ├── install.sh         → CLI installer script
  ├── latest             → Latest CLI version
  └── {version}/         → CLI tarballs
      ├── darwin-arm64.tar.gz
      ├── darwin-x64.tar.gz
      ├── linux-arm64.tar.gz
      └── linux-x64.tar.gz
```

### 2. Install Script (`scripts/install.sh`)

**Updated base URL:**
```bash
# Before
VERSIONS_URL="https://agents.craft.do"

# After
VERSIONS_URL="https://agents.craft.do/cli"
```

This change makes all download paths use the `/cli` prefix automatically.

### 3. Migration Script (`scripts/migrate-cli-to-prefix.ts`)

Created a script to copy existing CLI files to the new `/cli` prefix:
- Copies all version directories (e.g., `1.0.18/` → `cli/1.0.18/`)
- Copies `install.sh` → `cli/install.sh`
- Copies `latest` → `cli/latest`
- Preserves original files (manual deletion required after verification)

## Migration Steps

### Step 1: Run the migration script

```bash
cd /Users/ghalmos/Workspace/craft-agents
source .env
bun run scripts/migrate-cli-to-prefix.ts
```

This will copy all CLI files to the `/cli` prefix in S3.

### Step 2: Upload the updated install.sh

```bash
bun run scripts/upload.ts --script
```

Or manually upload:

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';

// ... (S3 client setup)

const installShContent = readFileSync('scripts/install.sh');
await s3.send(new PutObjectCommand({
  Bucket: 'agents-craft-do',
  Key: 'cli/install.sh',
  Body: installShContent,
  ContentType: 'text/x-shellscript',
  CacheControl: 'no-cache, no-store, must-revalidate',
}));
```

### Step 3: Deploy the CloudFlare worker

```bash
cd workers/agents-router
npx wrangler deploy
```

### Step 4: Test the new URLs

```bash
# Test CLI installer
curl -fsSL https://agents.craft.do/cli/install.sh | head -20

# Test latest version
curl -fsSL https://agents.craft.do/cli/latest

# Test version tarball
curl -I https://agents.craft.do/cli/1.0.18/darwin-arm64.tar.gz
```

### Step 5: Verify and cleanup (optional)

Once verified, you can delete the old root-level CLI files from S3 to clean up:
- `/install.sh` (old location)
- `/latest` (old location)
- All version directories at root: `/0.0.1/`, `/1.0.18/`, etc.

**Keep these root-level files:**
- `/install-app.sh` (Electron installer - redirect or keep for compatibility)
- `/install-app.ps1` (Electron installer - redirect or keep for compatibility)
- `/favicon.ico`, `/favicon.svg`, `/og-image.png` (marketing site assets)
- `/index.html`, `/apple-touch-icon.png` (marketing site assets)

## New URLs

### CLI Distribution

| Old URL | New URL |
|---------|---------|
| `https://agents.craft.do/install.sh` | `https://agents.craft.do/cli/install.sh` |
| `https://agents.craft.do/latest` | `https://agents.craft.do/cli/latest` |
| `https://agents.craft.do/1.0.18/darwin-arm64.tar.gz` | `https://agents.craft.do/cli/1.0.18/darwin-arm64.tar.gz` |

### Electron Distribution (unchanged)

| URL |
|-----|
| `https://agents.craft.do/electron/install-app.sh` |
| `https://agents.craft.do/electron/install-app.ps1` |
| `https://agents.craft.do/electron/latest` |
| `https://agents.craft.do/electron/0.2.21/Craft-Agent-arm64.dmg` |

## Installation Instructions (Updated)

### CLI Binary Installation

```bash
curl -fsSL https://agents.craft.do/cli/install.sh | bash
```

### Electron App Installation

**macOS/Linux:**
```bash
curl -fsSL https://agents.craft.do/install-app.sh | bash
```

**Windows:**
```powershell
irm https://agents.craft.do/install-app.ps1 | iex
```

## Benefits

1. **Cleaner organization** - Both distributions under their own prefixes
2. **Simpler router logic** - Just check for `/electron/*` or `/cli/*`
3. **Better scalability** - Easy to add more distribution types in the future
4. **Consistent structure** - Both follow the same pattern
5. **No conflicts** - Version numbers won't conflict with marketing site paths

## Rollback Plan

If issues occur, the old files are still in S3 at the root level. To rollback:

1. Revert the worker router to the previous version
2. Redeploy with `npx wrangler deploy`
3. Old URLs will work immediately (files are still there)
