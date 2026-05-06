/**
 * Helpers for the Claude SDK subprocess spawn site.
 *
 * Extracted to its own module so the path-picker, classification, and regex
 * matching can be unit-tested without spinning up a full ClaudeAgent.
 */

import { existsSync, lstatSync } from 'node:fs';

/**
 * Returns true iff `p` is an existing directory.
 *
 * Uses `lstatSync` so a symlink pointing at a missing target returns false
 * — broken symlinks must count as "missing" because spawn() will fail on them
 * anyway. Wrapped in try/catch so EACCES/ENOTDIR/etc. fall through cleanly.
 */
export function isExistingDirectory(p: string | null | undefined): boolean {
  if (!p) return false;
  try {
    return lstatSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Pure path picker: pick the first existing directory among the candidates.
 * The fallback (`workspaceRootPath`) is returned even when missing — there
 * is nothing better to fall back to, and the SDK error path will surface
 * the failure in that pathological case.
 */
export function pickFirstExistingDirectory(
  candidates: Array<string | null | undefined>,
  fallback: string,
): string {
  for (const c of candidates) {
    if (isExistingDirectory(c)) return c!;
  }
  return fallback;
}

/**
 * Match the SDK's `ReferenceError("Claude Code native binary not found at <path>")`
 * (and the older `executable not found at <path>` variant) and return the
 * captured path. Greedy capture to end-of-line to preserve macOS bundle paths
 * like `/Applications/Craft Agents.app/...`. A single trailing sentence period
 * is stripped only when present (the SDK historically appends one).
 */
const SDK_BINARY_NOT_FOUND_RE = /Claude Code (?:native binary|executable) not found at\s+(.+)$/m;

export function extractSdkReportedBinaryPath(rawErrorMsg: string | null | undefined): string | undefined {
  if (!rawErrorMsg) return undefined;
  const match = SDK_BINARY_NOT_FOUND_RE.exec(rawErrorMsg);
  if (!match || !match[1]) return undefined;
  return match[1].replace(/\.\s*$/, '');
}

/**
 * Detect spawn ENOENT from any of the channels Node and the SDK use to surface it:
 * - structured fields on the thrown error (`code === 'ENOENT'`, `syscall === 'spawn …'`)
 * - stringified `spawn … ENOENT` in either the raw error or captured stderr
 * - the SDK's own wrapper string (`Claude Code native binary not found at …`)
 */
export function isSpawnEnoent(input: {
  errorCode?: string;
  errorSyscall?: string;
  rawErrorMsg?: string | null;
  stderr?: string | null;
}): boolean {
  const { errorCode, errorSyscall, rawErrorMsg, stderr } = input;
  if (errorCode === 'ENOENT' && errorSyscall && errorSyscall.startsWith('spawn')) return true;
  if (rawErrorMsg && /\bspawn\b[\s\S]*\bENOENT\b/.test(rawErrorMsg)) return true;
  if (stderr && /\bspawn\b[\s\S]*\bENOENT\b/.test(stderr)) return true;
  if (rawErrorMsg && SDK_BINARY_NOT_FOUND_RE.test(rawErrorMsg)) return true;
  return false;
}

/**
 * Disambiguate an ENOENT failure between binary-missing and cwd-missing.
 * Returns 'unknown' when both paths exist on disk (transient race,
 * sandbox/quarantine, hardened-runtime) and 'binary' when both are missing
 * (binary is the more actionable cause — the user can reinstall).
 */
export function classifyEnoentCause(input: {
  binaryExists: boolean;
  cwdExists: boolean;
}): 'binary' | 'cwd' | 'unknown' {
  const { binaryExists, cwdExists } = input;
  if (!binaryExists && cwdExists) return 'binary';
  if (binaryExists && !cwdExists) return 'cwd';
  if (!binaryExists && !cwdExists) return 'binary';
  return 'unknown';
}

/**
 * Run an existing-disk probe for both the binary and cwd in a single call.
 * Implementation factored out so tests can inject a fake `fsExists` predicate
 * without touching the real filesystem.
 */
export function probeEnoentPaths(input: {
  binaryPath: string | undefined;
  cwdPath: string | undefined;
  fsExists?: (p: string) => boolean;
  dirExists?: (p: string) => boolean;
}): { binaryExists: boolean; cwdExists: boolean } {
  const fsExists = input.fsExists ?? existsSync;
  const dirExists = input.dirExists ?? isExistingDirectory;
  return {
    binaryExists: input.binaryPath ? fsExists(input.binaryPath) : false,
    cwdExists: input.cwdPath ? dirExists(input.cwdPath) : false,
  };
}
