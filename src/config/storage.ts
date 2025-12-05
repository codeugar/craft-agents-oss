import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  clientId: string;
  tokenType: string;
}

export interface StoredConfig {
  anthropicApiKey: string;
  craftMcpUrl: string;
  // OAuth credentials (when server requires auth)
  oauth?: OAuthCredentials;
  // Whether the MCP server is public (no auth required)
  isPublic?: boolean;
  model?: string;
}

const CONFIG_DIR = join(homedir(), '.craft-agent');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function configExists(): boolean {
  return existsSync(CONFIG_FILE);
}

export function loadStoredConfig(): StoredConfig | null {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return null;
    }
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(content) as StoredConfig;

    // Validate required fields
    if (!config.anthropicApiKey || !config.craftMcpUrl) {
      return null;
    }

    // Must have either OAuth credentials or be marked as public
    if (!config.oauth?.accessToken && !config.isPublic) {
      return null;
    }

    return config;
  } catch {
    return null;
  }
}

// Check if OAuth token needs refresh (with 5 minute buffer)
export function isTokenExpired(config: StoredConfig): boolean {
  if (!config.oauth?.expiresAt) {
    return false; // No expiry means it doesn't expire (or unknown)
  }
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() + bufferMs >= config.oauth.expiresAt;
}

// Get the access token to use for API calls (empty string for public servers)
export function getAccessToken(config: StoredConfig): string | null {
  if (config.isPublic) {
    return null; // No auth needed
  }
  if (config.oauth?.accessToken) {
    return config.oauth.accessToken;
  }
  return null;
}

// Update OAuth tokens after refresh
export function updateOAuthTokens(
  accessToken: string,
  refreshToken?: string,
  expiresAt?: number
): void {
  const config = loadStoredConfig();
  if (!config || !config.oauth) return;

  config.oauth.accessToken = accessToken;
  if (refreshToken) {
    config.oauth.refreshToken = refreshToken;
  }
  if (expiresAt) {
    config.oauth.expiresAt = expiresAt;
  }

  saveConfig(config);
}

export function saveConfig(config: StoredConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function clearConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, '{}', 'utf-8');
  }
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
