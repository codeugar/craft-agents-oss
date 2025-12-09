# Distribution & Auto-Update Implementation Plan

## Goal
Distribute Craft TUI Agent as native binaries with silent auto-updates, matching Claude Code's architecture.

---

## Table of Contents
1. [How Claude Code Does It](#how-claude-code-does-it)
2. [Part 1: Credential Storage](#part-1-credential-storage)
3. [Part 2: Build System](#part-2-build-system)
4. [Part 3: Auto-Updater](#part-3-auto-updater)
5. [Part 4: Install Scripts](#part-4-install-scripts)
6. [Part 5: CLI Commands](#part-5-cli-commands)
7. [Part 6: Server Setup](#part-6-server-setup)
8. [Implementation Order](#implementation-order)
9. [Testing Checklist](#testing-checklist)

---

## How Claude Code Does It

Based on research of Claude Code's implementation:

### Credential Storage
- **macOS**: Stores in Keychain via `security` CLI, then DELETES the `.credentials.json` file
- **Linux/Windows**: Stores in plain `~/.claude/credentials.json` file (chmod 600)
- **Format**: JSON with OAuth tokens, API keys, etc.

### Distribution
- Native binary compiled with Bun (`bun build --compile`)
- Hosted on Google Cloud Storage
- Manifest file with SHA256 checksums for each platform
- Install scripts: `install.sh` (macOS/Linux), `install.ps1` (Windows)

### Auto-Updates
- Custom implementation (Bun has no built-in auto-update)
- Version embedded at compile time via `--define BUILD_VERSION=...`
- Checks manifest on startup (async, non-blocking)
- Downloads new binary to temp, verifies checksum, atomic rename
- `DISABLE_AUTOUPDATER=1` environment variable to disable

---

## Part 1: Credential Storage

### Current State
- Uses `keytar` npm package (native Node.js addon)
- Requires N-API bindings, complicates Bun compilation
- Located in `src/credentials/backends/keytar.ts`

### Target State
- **macOS**: Use `security` CLI (built-in, no dependencies)
- **Linux/Windows**: Use JSON file (simple, no dependencies)
- No native addons = clean Bun compilation

### File: `src/credentials/backends/macos.ts`

```typescript
/**
 * macOS Keychain Backend
 *
 * Uses the built-in `security` CLI tool to access Keychain.
 * This is exactly how Claude Code stores credentials on macOS.
 */

import { spawn } from 'bun';
import type { CredentialBackend } from './types.ts';
import type { CredentialId, StoredCredential } from '../types.ts';
import { credentialIdToAccount, accountToCredentialId } from '../types.ts';

const SERVICE_NAME = 'craft-tui-agent';

export class MacOSKeychainBackend implements CredentialBackend {
  readonly name = 'macos-keychain';
  readonly priority = 100;

  async isAvailable(): Promise<boolean> {
    // Only available on macOS
    return process.platform === 'darwin';
  }

  async get(id: CredentialId): Promise<StoredCredential | null> {
    const account = credentialIdToAccount(id);

    try {
      const proc = spawn({
        cmd: ['security', 'find-generic-password', '-a', account, '-s', SERVICE_NAME, '-w'],
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) {
        return null; // Not found
      }

      const value = output.trim();
      if (!value) return null;

      try {
        return JSON.parse(value) as StoredCredential;
      } catch {
        // Legacy plain string value
        return { value };
      }
    } catch {
      return null;
    }
  }

  async set(id: CredentialId, credential: StoredCredential): Promise<void> {
    const account = credentialIdToAccount(id);
    const value = JSON.stringify(credential);

    // -U flag updates if exists, creates if not
    const proc = spawn({
      cmd: [
        'security', 'add-generic-password',
        '-a', account,
        '-s', SERVICE_NAME,
        '-w', value,
        '-U', // Update existing or add new
      ],
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Failed to store credential: ${stderr}`);
    }
  }

  async delete(id: CredentialId): Promise<boolean> {
    const account = credentialIdToAccount(id);

    try {
      const proc = spawn({
        cmd: ['security', 'delete-generic-password', '-a', account, '-s', SERVICE_NAME],
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const exitCode = await proc.exited;
      return exitCode === 0;
    } catch {
      return false;
    }
  }

  async list(filter?: Partial<CredentialId>): Promise<CredentialId[]> {
    // security dump-keychain is slow and verbose
    // Instead, we'll maintain a separate index file for listing
    // This matches Claude Code's approach of not implementing full list on macOS

    try {
      const proc = spawn({
        cmd: ['security', 'dump-keychain'],
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      if (exitCode !== 0) return [];

      // Parse output for our service entries
      const ids: CredentialId[] = [];
      const lines = output.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(`"svce"<blob>="${SERVICE_NAME}"`)) {
          // Look for the account in nearby lines
          for (let j = Math.max(0, i - 5); j < Math.min(lines.length, i + 5); j++) {
            const match = lines[j].match(/"acct"<blob>="([^"]+)"/);
            if (match) {
              const id = accountToCredentialId(match[1]);
              if (id) ids.push(id);
              break;
            }
          }
        }
      }

      // Apply filter
      if (!filter) return ids;

      return ids.filter((id) => {
        if (filter.type && id.type !== filter.type) return false;
        if (filter.workspaceId && id.workspaceId !== filter.workspaceId) return false;
        if (filter.agentId && id.agentId !== filter.agentId) return false;
        if (filter.name && id.name !== filter.name) return false;
        return true;
      });
    } catch {
      return [];
    }
  }
}
```

### File: `src/credentials/backends/file.ts`

```typescript
/**
 * File-based Credential Backend
 *
 * Stores credentials in a JSON file with restrictive permissions.
 * Used on Linux and Windows where native keychain CLIs are inconsistent.
 * This is exactly how Claude Code stores credentials on non-macOS platforms.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { CredentialBackend } from './types.ts';
import type { CredentialId, StoredCredential } from '../types.ts';
import { credentialIdToAccount, accountToCredentialId } from '../types.ts';

export class FileCredentialBackend implements CredentialBackend {
  readonly name = 'file';
  readonly priority = 50; // Lower than macOS keychain

  private readonly filePath: string;
  private cache: Map<string, StoredCredential> | null = null;

  constructor() {
    // ~/.craft-agent/credentials.json (matches Claude Code's ~/.claude/credentials.json)
    this.filePath = join(homedir(), '.craft-agent', 'credentials.json');
  }

  async isAvailable(): Promise<boolean> {
    // Available on all platforms, but lower priority than native options
    return true;
  }

  private ensureDirectory(): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }

  private loadCredentials(): Map<string, StoredCredential> {
    if (this.cache) return this.cache;

    try {
      if (existsSync(this.filePath)) {
        const content = readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(content);
        this.cache = new Map(Object.entries(data));
      } else {
        this.cache = new Map();
      }
    } catch {
      this.cache = new Map();
    }

    return this.cache;
  }

  private saveCredentials(): void {
    this.ensureDirectory();

    const data: Record<string, StoredCredential> = {};
    for (const [key, value] of this.cache || []) {
      data[key] = value;
    }

    writeFileSync(this.filePath, JSON.stringify(data, null, 2), { mode: 0o600 });

    // Ensure permissions are correct (chmod 600)
    try {
      chmodSync(this.filePath, 0o600);
    } catch {
      // May fail on Windows, that's okay
    }
  }

  async get(id: CredentialId): Promise<StoredCredential | null> {
    const credentials = this.loadCredentials();
    const account = credentialIdToAccount(id);
    return credentials.get(account) || null;
  }

  async set(id: CredentialId, credential: StoredCredential): Promise<void> {
    const credentials = this.loadCredentials();
    const account = credentialIdToAccount(id);
    credentials.set(account, credential);
    this.saveCredentials();
  }

  async delete(id: CredentialId): Promise<boolean> {
    const credentials = this.loadCredentials();
    const account = credentialIdToAccount(id);
    const existed = credentials.has(account);
    credentials.delete(account);

    if (credentials.size === 0) {
      // Delete the file if empty
      try {
        unlinkSync(this.filePath);
      } catch {
        // Ignore
      }
    } else {
      this.saveCredentials();
    }

    return existed;
  }

  async list(filter?: Partial<CredentialId>): Promise<CredentialId[]> {
    const credentials = this.loadCredentials();
    const ids: CredentialId[] = [];

    for (const account of credentials.keys()) {
      const id = accountToCredentialId(account);
      if (id) ids.push(id);
    }

    if (!filter) return ids;

    return ids.filter((id) => {
      if (filter.type && id.type !== filter.type) return false;
      if (filter.workspaceId && id.workspaceId !== filter.workspaceId) return false;
      if (filter.agentId && id.agentId !== filter.agentId) return false;
      if (filter.name && id.name !== filter.name) return false;
      return true;
    });
  }
}
```

### File: `src/credentials/manager.ts` (Modified)

Update the backend registration to use platform-specific backends:

```typescript
// In _doInitialize():

private async _doInitialize(): Promise<void> {
  const potentialBackends: CredentialBackend[] = [];

  // Platform-specific backends
  if (process.platform === 'darwin') {
    // macOS: prefer Keychain
    const { MacOSKeychainBackend } = await import('./backends/macos.ts');
    potentialBackends.push(new MacOSKeychainBackend());
  }

  // File backend as fallback (or primary on Linux/Windows)
  const { FileCredentialBackend } = await import('./backends/file.ts');
  potentialBackends.push(new FileCredentialBackend());

  // Environment variables (read-only, for CI/containers)
  potentialBackends.push(new EnvironmentBackend());

  // ... rest of initialization
}
```

### package.json Changes

```json
{
  "dependencies": {
    // REMOVE this line:
    // "keytar": "^7.9.0",
  }
}
```

---

## Part 2: Build System

### Version Injection

Bun's `--define` flag injects constants at compile time:

```typescript
// These become global constants in the compiled binary
declare const BUILD_VERSION: string;
declare const BUILD_TIME: string;
declare const BUILD_PLATFORM: string;

// Usage in code:
console.log(`Version: ${BUILD_VERSION}`);
console.log(`Built: ${BUILD_TIME}`);
```

### File: `scripts/build.ts`

```typescript
#!/usr/bin/env bun
/**
 * Build script for creating platform-specific binaries.
 *
 * Usage:
 *   bun run scripts/build.ts              # Build for current platform
 *   bun run scripts/build.ts --all        # Build for all platforms
 *   bun run scripts/build.ts --target darwin-arm64
 */

import { $ } from 'bun';
import { readFileSync, mkdirSync, existsSync, createHash } from 'fs';
import { join } from 'path';

// Read version from package.json
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const VERSION = pkg.version;
const BUILD_TIME = new Date().toISOString();

// Build targets
const TARGETS = [
  { name: 'darwin-arm64', bunTarget: 'bun-darwin-arm64', ext: '' },
  { name: 'darwin-x64', bunTarget: 'bun-darwin-x64', ext: '' },
  { name: 'linux-x64', bunTarget: 'bun-linux-x64', ext: '' },
  { name: 'windows-x64', bunTarget: 'bun-windows-x64', ext: '.exe' },
] as const;

// Parse arguments
const args = process.argv.slice(2);
const buildAll = args.includes('--all');
const targetArg = args.find(a => a.startsWith('--target='))?.split('=')[1];

// Determine which targets to build
let targetsToBuild = TARGETS;
if (targetArg) {
  const target = TARGETS.find(t => t.name === targetArg);
  if (!target) {
    console.error(`Unknown target: ${targetArg}`);
    console.error(`Available: ${TARGETS.map(t => t.name).join(', ')}`);
    process.exit(1);
  }
  targetsToBuild = [target];
} else if (!buildAll) {
  // Default: build for current platform
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const currentTarget = `${platform}-${arch}`;
  const target = TARGETS.find(t => t.name === currentTarget);
  if (target) {
    targetsToBuild = [target];
  }
}

// Ensure dist directory exists
const distDir = 'dist';
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Build each target
console.log(`Building version ${VERSION}...`);
console.log(`Build time: ${BUILD_TIME}`);
console.log('');

const manifest: {
  version: string;
  releaseDate: string;
  binaries: Record<string, { url: string; sha256: string; size: number }>;
} = {
  version: VERSION,
  releaseDate: BUILD_TIME,
  binaries: {},
};

for (const target of targetsToBuild) {
  const outfile = join(distDir, `craft-${target.name}${target.ext}`);

  console.log(`Building ${target.name}...`);

  try {
    await $`bun build --compile \
      --target=${target.bunTarget} \
      --define BUILD_VERSION='"${VERSION}"' \
      --define BUILD_TIME='"${BUILD_TIME}"' \
      --define BUILD_PLATFORM='"${target.name}"' \
      src/index.tsx \
      --outfile ${outfile}`.quiet();

    // Calculate SHA256
    const content = readFileSync(outfile);
    const hash = createHash('sha256').update(content).digest('hex');
    const size = content.length;

    console.log(`  ✓ ${outfile} (${(size / 1024 / 1024).toFixed(2)} MB)`);
    console.log(`    SHA256: ${hash}`);

    manifest.binaries[target.name] = {
      url: `https://your-server.com/craft/craft-${target.name}${target.ext}`,
      sha256: hash,
      size,
    };
  } catch (error) {
    console.error(`  ✗ Failed to build ${target.name}:`, error);
  }

  console.log('');
}

// Write manifest
const manifestPath = join(distDir, 'latest.json');
Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`Manifest written to ${manifestPath}`);
```

### package.json Scripts

```json
{
  "scripts": {
    "build": "bun run scripts/build.ts",
    "build:all": "bun run scripts/build.ts --all",
    "build:macos": "bun run scripts/build.ts --target=darwin-arm64",
    "build:linux": "bun run scripts/build.ts --target=linux-x64",
    "build:windows": "bun run scripts/build.ts --target=windows-x64"
  }
}
```

---

## Part 3: Auto-Updater

### File: `src/updater/version.ts`

```typescript
/**
 * Version utilities and build-time constants.
 */

// These are injected at compile time by bun build --define
// When running in dev mode (not compiled), provide fallbacks
declare const BUILD_VERSION: string | undefined;
declare const BUILD_TIME: string | undefined;
declare const BUILD_PLATFORM: string | undefined;

export function getVersion(): string {
  if (typeof BUILD_VERSION !== 'undefined') {
    return BUILD_VERSION;
  }
  // Fallback for dev mode
  try {
    const pkg = require('../../package.json');
    return pkg.version || '0.0.0-dev';
  } catch {
    return '0.0.0-dev';
  }
}

export function getBuildTime(): string {
  if (typeof BUILD_TIME !== 'undefined') {
    return BUILD_TIME;
  }
  return new Date().toISOString();
}

export function getBuildPlatform(): string {
  if (typeof BUILD_PLATFORM !== 'undefined') {
    return BUILD_PLATFORM;
  }
  // Detect current platform
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  return `${platform}-${arch}`;
}

export function isCompiledBinary(): boolean {
  return typeof BUILD_VERSION !== 'undefined';
}

/**
 * Compare two semantic versions.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/, '').split('.').map(Number);
  const partsB = b.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }

  return 0;
}
```

### File: `src/updater/config.ts`

```typescript
/**
 * Auto-updater configuration.
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

// Update server URL - change this to your server
export const UPDATE_SERVER_URL = 'https://your-server.com/craft';
export const MANIFEST_URL = `${UPDATE_SERVER_URL}/latest.json`;

// Check interval: 4 hours in milliseconds
export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// State file location
const STATE_FILE = join(homedir(), '.craft-agent', 'update-state.json');

export interface UpdateState {
  lastCheck: number;
  lastVersion: string | null;
  pendingUpdate: string | null;
  autoUpdate: boolean;
}

export function loadUpdateState(): UpdateState {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {
    // Ignore
  }

  return {
    lastCheck: 0,
    lastVersion: null,
    pendingUpdate: null,
    autoUpdate: true,
  };
}

export function saveUpdateState(state: UpdateState): void {
  try {
    const dir = join(homedir(), '.craft-agent');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Ignore
  }
}

export function isAutoUpdateDisabled(): boolean {
  // Check environment variable (same as Claude Code)
  if (process.env.DISABLE_AUTOUPDATER === '1') {
    return true;
  }

  const state = loadUpdateState();
  return !state.autoUpdate;
}
```

### File: `src/updater/download.ts`

```typescript
/**
 * Binary download and verification.
 */

import { createHash } from 'crypto';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';

export interface DownloadResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export async function downloadBinary(
  url: string,
  expectedSha256: string
): Promise<DownloadResult> {
  const tempPath = join(tmpdir(), `craft-update-${Date.now()}`);

  try {
    // Download
    const response = await fetch(url);
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }

    const buffer = await response.arrayBuffer();
    writeFileSync(tempPath, Buffer.from(buffer));

    // Verify checksum
    const content = readFileSync(tempPath);
    const actualHash = createHash('sha256').update(content).digest('hex');

    if (actualHash !== expectedSha256) {
      unlinkSync(tempPath);
      return {
        success: false,
        error: `Checksum mismatch: expected ${expectedSha256}, got ${actualHash}`,
      };
    }

    return { success: true, filePath: tempPath };
  } catch (error) {
    // Clean up on error
    if (existsSync(tempPath)) {
      try { unlinkSync(tempPath); } catch {}
    }
    return { success: false, error: String(error) };
  }
}
```

### File: `src/updater/replace.ts`

```typescript
/**
 * Binary replacement logic.
 *
 * Handles the tricky task of replacing a running executable.
 */

import { renameSync, chmodSync, unlinkSync, existsSync } from 'fs';
import { dirname, join } from 'path';

export interface ReplaceResult {
  success: boolean;
  error?: string;
}

/**
 * Get the path to the currently running executable.
 */
export function getCurrentExecutablePath(): string {
  // Bun.argv[0] is the path to the executable
  // For compiled binaries, this is the binary itself
  // For dev mode, this is the bun executable
  return process.argv[0];
}

/**
 * Replace the current executable with a new one.
 *
 * Strategy:
 * 1. Rename current binary to .old
 * 2. Move new binary into place
 * 3. Delete .old on success
 *
 * On Windows, we can't rename a running executable,
 * so we write to a .new file and rename on next startup.
 */
export function replaceBinary(
  currentPath: string,
  newPath: string
): ReplaceResult {
  const oldPath = `${currentPath}.old`;
  const isWindows = process.platform === 'win32';

  try {
    if (isWindows) {
      // Windows: can't rename running executable
      // Write to .new, will be swapped on next startup
      const newLocation = `${currentPath}.new`;
      renameSync(newPath, newLocation);
      return { success: true };
    }

    // Unix: can rename running executable
    // Step 1: Rename current to .old
    if (existsSync(oldPath)) {
      unlinkSync(oldPath);
    }
    renameSync(currentPath, oldPath);

    // Step 2: Move new into place
    renameSync(newPath, currentPath);

    // Step 3: Set executable permissions
    chmodSync(currentPath, 0o755);

    // Step 4: Clean up old
    try {
      unlinkSync(oldPath);
    } catch {
      // May fail if still in use, that's okay
    }

    return { success: true };
  } catch (error) {
    // Try to recover
    if (existsSync(oldPath) && !existsSync(currentPath)) {
      try {
        renameSync(oldPath, currentPath);
      } catch {}
    }

    return { success: false, error: String(error) };
  }
}

/**
 * Check for and apply pending Windows update.
 * Call this at startup on Windows.
 */
export function applyPendingWindowsUpdate(): boolean {
  if (process.platform !== 'win32') return false;

  const currentPath = getCurrentExecutablePath();
  const pendingPath = `${currentPath}.new`;

  if (!existsSync(pendingPath)) return false;

  try {
    const oldPath = `${currentPath}.old`;

    // Rename current to .old
    if (existsSync(oldPath)) unlinkSync(oldPath);
    renameSync(currentPath, oldPath);

    // Move .new to current
    renameSync(pendingPath, currentPath);

    // Clean up
    try { unlinkSync(oldPath); } catch {}

    return true;
  } catch {
    return false;
  }
}
```

### File: `src/updater/index.ts`

```typescript
/**
 * Auto-updater main module.
 *
 * Provides automatic update checking and installation,
 * matching Claude Code's behavior.
 */

import { debug } from '../tui/utils/debug.ts';
import {
  MANIFEST_URL,
  CHECK_INTERVAL_MS,
  loadUpdateState,
  saveUpdateState,
  isAutoUpdateDisabled,
} from './config.ts';
import {
  getVersion,
  getBuildPlatform,
  isCompiledBinary,
  compareVersions,
} from './version.ts';
import { downloadBinary } from './download.ts';
import {
  getCurrentExecutablePath,
  replaceBinary,
  applyPendingWindowsUpdate,
} from './replace.ts';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion: string;
  downloadUrl?: string;
  sha256?: string;
}

export interface UpdateResult {
  success: boolean;
  message: string;
  requiresRestart?: boolean;
}

interface Manifest {
  version: string;
  releaseDate: string;
  binaries: Record<string, { url: string; sha256: string; size: number }>;
}

/**
 * Check for updates.
 * Returns update info without downloading.
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const currentVersion = getVersion();
  const platform = getBuildPlatform();

  const result: UpdateInfo = {
    available: false,
    currentVersion,
    latestVersion: currentVersion,
  };

  try {
    const response = await fetch(MANIFEST_URL);
    if (!response.ok) {
      debug(`[Updater] Failed to fetch manifest: HTTP ${response.status}`);
      return result;
    }

    const manifest: Manifest = await response.json();
    result.latestVersion = manifest.version;

    // Check if update is available
    if (compareVersions(manifest.version, currentVersion) > 0) {
      const binary = manifest.binaries[platform];
      if (binary) {
        result.available = true;
        result.downloadUrl = binary.url;
        result.sha256 = binary.sha256;
      } else {
        debug(`[Updater] No binary for platform: ${platform}`);
      }
    }
  } catch (error) {
    debug(`[Updater] Error checking for updates: ${error}`);
  }

  return result;
}

/**
 * Download and install an update.
 */
export async function installUpdate(info: UpdateInfo): Promise<UpdateResult> {
  if (!info.available || !info.downloadUrl || !info.sha256) {
    return { success: false, message: 'No update available' };
  }

  debug(`[Updater] Downloading ${info.latestVersion} from ${info.downloadUrl}`);

  // Download
  const downloadResult = await downloadBinary(info.downloadUrl, info.sha256);
  if (!downloadResult.success || !downloadResult.filePath) {
    return { success: false, message: downloadResult.error || 'Download failed' };
  }

  debug(`[Updater] Downloaded to ${downloadResult.filePath}`);

  // Replace
  const currentPath = getCurrentExecutablePath();
  const replaceResult = replaceBinary(currentPath, downloadResult.filePath);

  if (!replaceResult.success) {
    return { success: false, message: replaceResult.error || 'Replace failed' };
  }

  // Update state
  const state = loadUpdateState();
  state.lastVersion = info.latestVersion;
  state.pendingUpdate = null;
  saveUpdateState(state);

  return {
    success: true,
    message: `Updated to ${info.latestVersion}`,
    requiresRestart: true,
  };
}

/**
 * Run update check in background.
 * Call this at startup.
 */
export async function backgroundUpdateCheck(
  onUpdateAvailable?: (info: UpdateInfo) => void,
  onUpdateInstalled?: (result: UpdateResult) => void
): Promise<void> {
  // Apply pending Windows update first
  if (applyPendingWindowsUpdate()) {
    debug('[Updater] Applied pending Windows update');
  }

  // Skip if not a compiled binary (dev mode)
  if (!isCompiledBinary()) {
    debug('[Updater] Skipping update check in dev mode');
    return;
  }

  // Skip if disabled
  if (isAutoUpdateDisabled()) {
    debug('[Updater] Auto-updates disabled');
    return;
  }

  // Check rate limiting
  const state = loadUpdateState();
  const now = Date.now();
  if (now - state.lastCheck < CHECK_INTERVAL_MS) {
    debug('[Updater] Skipping check (rate limited)');
    return;
  }

  // Update last check time
  state.lastCheck = now;
  saveUpdateState(state);

  // Check for updates
  const info = await checkForUpdate();

  if (info.available) {
    debug(`[Updater] Update available: ${info.currentVersion} → ${info.latestVersion}`);
    onUpdateAvailable?.(info);

    // Auto-install
    const result = await installUpdate(info);
    if (result.success) {
      debug(`[Updater] Update installed: ${result.message}`);
      onUpdateInstalled?.(result);
    } else {
      debug(`[Updater] Update failed: ${result.message}`);
    }
  } else {
    debug(`[Updater] No update available (current: ${info.currentVersion})`);
  }
}

/**
 * Force an update check (for `craft update` command).
 */
export async function forceUpdateCheck(): Promise<UpdateResult> {
  const info = await checkForUpdate();

  if (!info.available) {
    return {
      success: true,
      message: `Already up to date (${info.currentVersion})`,
    };
  }

  return installUpdate(info);
}
```

---

## Part 4: Install Scripts

### File: `scripts/install.sh`

```bash
#!/bin/bash
# Craft TUI Agent Installer
# Usage: curl -fsSL https://your-server.com/craft/install.sh | bash
#        curl -fsSL https://your-server.com/craft/install.sh | bash -s -- latest
#        curl -fsSL https://your-server.com/craft/install.sh | bash -s -- 1.0.0

set -e

# Configuration
BASE_URL="${CRAFT_INSTALL_URL:-https://your-server.com/craft}"
INSTALL_DIR="${CRAFT_INSTALL_DIR:-$HOME/.local/bin}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
info() { echo -e "${BLUE}[info]${NC} $1"; }
success() { echo -e "${GREEN}[success]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

# Detect platform
detect_platform() {
  local os arch

  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Linux*)  os="linux" ;;
    Darwin*) os="darwin" ;;
    *)       error "Unsupported OS: $os" ;;
  esac

  case "$arch" in
    x86_64)         arch="x64" ;;
    amd64)          arch="x64" ;;
    arm64)          arch="arm64" ;;
    aarch64)        arch="arm64" ;;
    *)              error "Unsupported architecture: $arch" ;;
  esac

  echo "${os}-${arch}"
}

# Download with retry
download() {
  local url="$1"
  local output="$2"
  local max_retries=3
  local retry=0

  while [ $retry -lt $max_retries ]; do
    if curl -fsSL "$url" -o "$output" 2>/dev/null; then
      return 0
    fi
    retry=$((retry + 1))
    warn "Download failed, retrying ($retry/$max_retries)..."
    sleep 1
  done

  return 1
}

# Main installation
main() {
  local version="${1:-latest}"
  local platform
  local binary_url
  local temp_file

  info "Installing Craft TUI Agent..."

  # Detect platform
  platform="$(detect_platform)"
  info "Detected platform: $platform"

  # Determine download URL
  if [ "$version" = "latest" ]; then
    binary_url="${BASE_URL}/craft-${platform}"
  else
    binary_url="${BASE_URL}/releases/${version}/craft-${platform}"
  fi

  # Add .exe for Windows (WSL)
  if [[ "$platform" == *"windows"* ]]; then
    binary_url="${binary_url}.exe"
  fi

  info "Downloading from: $binary_url"

  # Download to temp file
  temp_file="$(mktemp)"
  if ! download "$binary_url" "$temp_file"; then
    rm -f "$temp_file"
    error "Failed to download binary"
  fi

  # Create install directory
  mkdir -p "$INSTALL_DIR"

  # Install binary
  local install_path="${INSTALL_DIR}/craft"
  mv "$temp_file" "$install_path"
  chmod +x "$install_path"

  success "Installed to: $install_path"

  # Check PATH
  if ! echo "$PATH" | grep -q "$INSTALL_DIR"; then
    warn "$INSTALL_DIR is not in your PATH"
    echo ""
    echo "Add to your shell profile:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
  fi

  # Verify installation
  if "$install_path" --version >/dev/null 2>&1; then
    success "Installation verified!"
    "$install_path" --version
  else
    warn "Installation complete, but verification failed"
  fi

  echo ""
  success "Run 'craft' to get started!"
}

main "$@"
```

### File: `scripts/install.ps1`

```powershell
# Craft TUI Agent Installer for Windows
# Usage: irm https://your-server.com/craft/install.ps1 | iex
#        & ([scriptblock]::Create((irm https://your-server.com/craft/install.ps1))) latest
#        & ([scriptblock]::Create((irm https://your-server.com/craft/install.ps1))) 1.0.0

param(
    [string]$Version = "latest"
)

$ErrorActionPreference = "Stop"

# Configuration
$BaseUrl = if ($env:CRAFT_INSTALL_URL) { $env:CRAFT_INSTALL_URL } else { "https://your-server.com/craft" }
$InstallDir = if ($env:CRAFT_INSTALL_DIR) { $env:CRAFT_INSTALL_DIR } else { "$env:LOCALAPPDATA\craft" }

function Write-Info { param($Message) Write-Host "[info] $Message" -ForegroundColor Blue }
function Write-Success { param($Message) Write-Host "[success] $Message" -ForegroundColor Green }
function Write-Warn { param($Message) Write-Host "[warn] $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "[error] $Message" -ForegroundColor Red; exit 1 }

function Get-Platform {
    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    return "windows-$arch"
}

function Install-Craft {
    param([string]$Version)

    Write-Info "Installing Craft TUI Agent..."

    # Detect platform
    $platform = Get-Platform
    Write-Info "Detected platform: $platform"

    # Determine download URL
    if ($Version -eq "latest") {
        $binaryUrl = "$BaseUrl/craft-$platform.exe"
    } else {
        $binaryUrl = "$BaseUrl/releases/$Version/craft-$platform.exe"
    }

    Write-Info "Downloading from: $binaryUrl"

    # Create install directory
    if (!(Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    # Download
    $installPath = Join-Path $InstallDir "craft.exe"
    try {
        Invoke-WebRequest -Uri $binaryUrl -OutFile $installPath -UseBasicParsing
    } catch {
        Write-Error "Failed to download: $_"
    }

    Write-Success "Installed to: $installPath"

    # Add to PATH
    $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($userPath -notlike "*$InstallDir*") {
        [Environment]::SetEnvironmentVariable("PATH", "$userPath;$InstallDir", "User")
        Write-Success "Added $InstallDir to PATH"
        Write-Warn "Restart your terminal for PATH changes to take effect"
    }

    # Verify
    try {
        $versionOutput = & $installPath --version 2>&1
        Write-Success "Installation verified!"
        Write-Host $versionOutput
    } catch {
        Write-Warn "Installation complete, but verification failed"
    }

    Write-Host ""
    Write-Success "Run 'craft' to get started!"
}

Install-Craft -Version $Version
```

---

## Part 5: CLI Commands

### File: `src/index.tsx` (Modifications)

Add these at the top of the file, before the Ink app starts:

```typescript
import { getVersion, getBuildTime, getBuildPlatform, isCompiledBinary } from './updater/version.ts';
import { forceUpdateCheck, backgroundUpdateCheck } from './updater/index.ts';
import { getCredentialManager } from './credentials/index.ts';

// Handle --version flag
if (cli.flags.version) {
  const version = getVersion();
  const buildTime = getBuildTime();
  const platform = getBuildPlatform();
  const isCompiled = isCompiledBinary();

  console.log(`craft ${version}`);
  if (isCompiled) {
    console.log(`Built: ${buildTime}`);
    console.log(`Platform: ${platform}`);
  } else {
    console.log('(development mode)');
  }
  process.exit(0);
}

// Handle `craft update` command
if (cli.input[0] === 'update') {
  console.log('Checking for updates...');
  const result = await forceUpdateCheck();
  console.log(result.message);
  if (result.requiresRestart) {
    console.log('Restart craft to use the new version.');
  }
  process.exit(result.success ? 0 : 1);
}

// Handle `craft doctor` command
if (cli.input[0] === 'doctor') {
  console.log('Craft TUI Agent Diagnostics');
  console.log('===========================');
  console.log('');

  // Version info
  const version = getVersion();
  const isCompiled = isCompiledBinary();
  console.log(`Version: ${version}`);
  console.log(`Installation: ${isCompiled ? 'Native binary' : 'Development mode'}`);
  console.log(`Platform: ${getBuildPlatform()}`);
  console.log(`Auto-updates: ${isCompiled ? 'Yes' : 'No (dev mode)'}`);
  console.log('');

  // Credential backend
  const credManager = getCredentialManager();
  await credManager.initialize();
  const backendName = credManager.getActiveBackendName();
  console.log(`Credential storage: ${backendName || 'None'}`);

  // Check for updates
  console.log('');
  console.log('Checking for updates...');
  const { checkForUpdate } = await import('./updater/index.ts');
  const updateInfo = await checkForUpdate();
  if (updateInfo.available) {
    console.log(`Update available: ${updateInfo.currentVersion} → ${updateInfo.latestVersion}`);
  } else {
    console.log(`Up to date (${updateInfo.currentVersion})`);
  }

  process.exit(0);
}

// Start background update check (non-blocking)
backgroundUpdateCheck(
  (info) => {
    // Could show notification in UI
    debug(`Update available: ${info.latestVersion}`);
  },
  (result) => {
    if (result.requiresRestart) {
      // Could show "Update installed, restart to apply" in UI
      debug(`Update installed: ${result.message}`);
    }
  }
).catch((err) => {
  debug(`Background update check failed: ${err}`);
});
```

Update the meow CLI flags:

```typescript
const cli = meow(`
  Usage
    $ craft [options]

  Commands
    update    Check for and install updates
    doctor    Show diagnostics

  Options
    --setup   Force setup wizard
    --url, -u Override MCP server URL
    --token, -t Override bearer token
    --model, -m Override model selection
    --debug   Enable debug logging
    --version Show version

  Examples
    $ craft
    $ craft --setup
    $ craft update
    $ craft doctor
`, {
  importMeta: import.meta,
  flags: {
    setup: { type: 'boolean' },
    url: { type: 'string', shortFlag: 'u' },
    token: { type: 'string', shortFlag: 't' },
    model: { type: 'string', shortFlag: 'm' },
    debug: { type: 'boolean' },
    version: { type: 'boolean' },
  },
});
```

---

## Part 6: Server Setup

### Directory Structure

```
https://your-server.com/craft/
├── latest.json              # Version manifest
├── craft-darwin-arm64       # macOS Apple Silicon binary
├── craft-darwin-x64         # macOS Intel binary
├── craft-linux-x64          # Linux x64 binary
├── craft-windows-x64.exe    # Windows x64 binary
├── install.sh               # macOS/Linux installer script
└── install.ps1              # Windows installer script
```

### latest.json Format

```json
{
  "version": "1.0.0",
  "releaseDate": "2025-12-08T00:00:00Z",
  "binaries": {
    "darwin-arm64": {
      "url": "https://your-server.com/craft/craft-darwin-arm64",
      "sha256": "abc123...",
      "size": 50000000
    },
    "darwin-x64": {
      "url": "https://your-server.com/craft/craft-darwin-x64",
      "sha256": "def456...",
      "size": 52000000
    },
    "linux-x64": {
      "url": "https://your-server.com/craft/craft-linux-x64",
      "sha256": "ghi789...",
      "size": 48000000
    },
    "windows-x64": {
      "url": "https://your-server.com/craft/craft-windows-x64.exe",
      "sha256": "jkl012...",
      "size": 55000000
    }
  }
}
```

### Release Process

1. Update version in `package.json`
2. Run `bun run build:all`
3. Upload binaries from `dist/` to server
4. Upload `dist/latest.json` to server
5. Test installation: `curl -fsSL https://your-server.com/craft/install.sh | bash`

---

## Implementation Order

### Phase 1: Credential Storage (Day 1)
1. Create `src/credentials/backends/macos.ts`
2. Create `src/credentials/backends/file.ts`
3. Update `src/credentials/manager.ts`
4. Remove keytar from package.json
5. Delete `src/credentials/backends/keytar.ts`
6. Test on macOS

### Phase 2: Build System (Day 1-2)
1. Create `scripts/build.ts`
2. Add build scripts to package.json
3. Test `bun build --compile` on macOS
4. Verify binary runs and can access keychain
5. Test cross-compilation

### Phase 3: Version & CLI (Day 2)
1. Create `src/updater/version.ts`
2. Update `src/index.tsx` with --version, update, doctor
3. Test version display in compiled binary

### Phase 4: Auto-Updater (Day 2-3)
1. Create `src/updater/config.ts`
2. Create `src/updater/download.ts`
3. Create `src/updater/replace.ts`
4. Create `src/updater/index.ts`
5. Integrate into startup
6. Test update flow locally

### Phase 5: Distribution (Day 3)
1. Create `scripts/install.sh`
2. Create `scripts/install.ps1`
3. Set up server hosting
4. Upload binaries and manifest
5. Test end-to-end installation

---

## Testing Checklist

### Credential Storage
- [ ] macOS: Store credential in Keychain
- [ ] macOS: Retrieve credential from Keychain
- [ ] macOS: Delete credential from Keychain
- [ ] macOS: List credentials works
- [ ] Linux: Store credential in file
- [ ] Linux: File has correct permissions (600)
- [ ] Windows: Store credential in file
- [ ] Migration: Existing keytar credentials still accessible

### Build System
- [ ] `bun run build` creates binary for current platform
- [ ] `bun run build:all` creates all platform binaries
- [ ] BUILD_VERSION is correctly embedded
- [ ] Binary runs without Bun installed
- [ ] Binary can access credential storage

### Auto-Updater
- [ ] Version check fetches manifest
- [ ] Version comparison works correctly
- [ ] Download verifies SHA256
- [ ] Binary replacement works on macOS
- [ ] Binary replacement works on Linux
- [ ] Pending update applied on Windows
- [ ] Rate limiting prevents excessive checks
- [ ] DISABLE_AUTOUPDATER=1 disables updates

### CLI Commands
- [ ] `craft --version` shows version
- [ ] `craft update` forces update check
- [ ] `craft doctor` shows diagnostics

### Install Scripts
- [ ] install.sh works on macOS arm64
- [ ] install.sh works on macOS x64
- [ ] install.sh works on Linux x64
- [ ] install.ps1 works on Windows
- [ ] PATH is updated correctly

---

## Sources
- [Claude Code Setup Docs](https://code.claude.com/docs/en/setup)
- [GitHub Issue #10039 - Credentials Storage](https://github.com/anthropics/claude-code/issues/10039)
- [GitHub Issue #9403 - Keychain Implementation](https://github.com/anthropics/claude-code/issues/9403)
- [GitHub Issue #4117 - Self-Update Mechanism](https://github.com/anthropics/claude-code/issues/4117)
- [Bun Single-file Executable Docs](https://bun.com/docs/bundler/executables)
