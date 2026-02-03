/**
 * Codex Authentication Utilities
 *
 * Provides helper functions for checking Codex authentication status.
 * Codex uses ~/.codex/auth.json for ChatGPT Plus OAuth tokens.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Path to the Codex auth file.
 */
const CODEX_AUTH_PATH = join(homedir(), '.codex', 'auth.json');

/**
 * Structure of the Codex auth file.
 * Note: The actual format has tokens nested under a "tokens" object.
 */
interface CodexAuthFile {
  auth_mode?: string;
  tokens?: {
    access_token?: string;
    refresh_token?: string;
    id_token?: string;
    account_id?: string;
  };
  last_refresh?: string;
  // Legacy format (direct tokens at root)
  access_token?: string;
  refresh_token?: string;
  expires_at?: string | number;
}

/**
 * Check if Codex OAuth credentials are configured.
 * Reads from ~/.codex/auth.json which is managed by the Codex CLI.
 *
 * @returns true if valid OAuth credentials exist
 */
export function hasCodexOAuth(): boolean {
  try {
    if (!existsSync(CODEX_AUTH_PATH)) {
      return false;
    }

    const content = readFileSync(CODEX_AUTH_PATH, 'utf-8');
    const auth = JSON.parse(content) as CodexAuthFile;

    // Check for access token in nested tokens object (current format)
    // or at root level (legacy format)
    const accessToken = auth.tokens?.access_token || auth.access_token;
    if (!accessToken) {
      return false;
    }

    // Check expiration if present (legacy format only)
    // Note: Current format uses last_refresh but doesn't include expires_at
    // The access_token JWT contains expiration info, but we trust it's valid
    // since the Codex CLI handles token refresh automatically
    if (auth.expires_at) {
      const expiresAt = typeof auth.expires_at === 'string'
        ? new Date(auth.expires_at).getTime()
        : auth.expires_at;

      // Allow some buffer (5 minutes) after expiration for refresh
      if (expiresAt < Date.now() - 5 * 60 * 1000) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Get the path to the Codex auth file.
 * Useful for debugging and UI messages.
 */
export function getCodexAuthPath(): string {
  return CODEX_AUTH_PATH;
}
