/**
 * Shared environment sanitization for script-execution tools.
 */

/**
 * Env vars stripped from subprocesses to prevent credential leakage.
 * NOTE: Keep in sync with packages/shared/src/mcp/client.ts (BLOCKED_ENV_VARS).
 */
export const BLOCKED_ENV_VARS = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'STRIPE_SECRET_KEY',
  'NPM_TOKEN',
] as const;

/**
 * Return a shallow-copied environment with sensitive variables removed.
 */
export function createSanitizedEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  for (const key of BLOCKED_ENV_VARS) {
    delete env[key];
  }
  return env;
}
