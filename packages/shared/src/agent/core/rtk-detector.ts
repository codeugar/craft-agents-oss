/**
 * RTK binary detector.
 *
 * Resolves the path to the rtk binary (https://github.com/rtk-ai/rtk) by
 * looking it up on the user's PATH, then verifies it meets the minimum
 * version required by `rtk rewrite` (added in 0.23.0).
 *
 * Result is cached per process — restart the app to pick up an install
 * or upgrade.
 *
 * Bundling rtk in `apps/electron/resources/bin/` is a separate concern
 * (see plans/rtk-integration-path-a.md); this MVP detects only.
 */

import { execFileSync } from 'node:child_process';

const REQUIRED_MIN_VERSION = { major: 0, minor: 23, patch: 0 } as const;

let cachedPath: string | null | undefined = undefined;

/**
 * Get the absolute path to the rtk binary, or null if not installed
 * or installed version is below the required minimum.
 */
export function getRtkPath(): string | null {
  if (cachedPath !== undefined) return cachedPath;

  const whichCmd = process.platform === 'win32' ? 'where' : 'which';

  let rtkPath: string | null = null;
  try {
    const result = execFileSync(whichCmd, ['rtk'], { encoding: 'utf-8', timeout: 2000 }).trim();
    // `where` returns multiple lines on Windows — take the first.
    const firstLine = result.split('\n')[0]?.trim();
    if (firstLine) rtkPath = firstLine;
  } catch {
    // Binary not on PATH.
  }

  if (!rtkPath) {
    cachedPath = null;
    return null;
  }

  if (!checkRtkVersion(rtkPath)) {
    cachedPath = null;
    return null;
  }

  cachedPath = rtkPath;
  return rtkPath;
}

function checkRtkVersion(rtkPath: string): boolean {
  try {
    const versionOutput = execFileSync(rtkPath, ['--version'], { encoding: 'utf-8', timeout: 2000 }).trim();
    const versionMatch = versionOutput.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!versionMatch) return false;

    const major = Number(versionMatch[1]);
    const minor = Number(versionMatch[2]);
    const patch = Number(versionMatch[3]);

    if (major !== REQUIRED_MIN_VERSION.major) return major > REQUIRED_MIN_VERSION.major;
    if (minor !== REQUIRED_MIN_VERSION.minor) return minor > REQUIRED_MIN_VERSION.minor;
    return patch >= REQUIRED_MIN_VERSION.patch;
  } catch {
    return false;
  }
}

/** For tests only — clears the cached path. */
export function resetRtkPathCache(): void {
  cachedPath = undefined;
}
