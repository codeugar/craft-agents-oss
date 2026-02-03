/**
 * Backend Factory
 *
 * Creates the appropriate AI backend based on configuration.
 * Supports two backends:
 * - Claude (Anthropic) - Default, using @anthropic-ai/claude-agent-sdk
 * - Codex (OpenAI) - Using app-server mode with JSON-RPC
 */

import type { AgentBackend, BackendConfig, AgentProvider } from './types.ts';
import { ClaudeBackend } from './claude.ts';
import { CodexBackend } from './codex/index.ts';

/**
 * Detect provider from stored auth type.
 *
 * Maps authentication types to their corresponding providers:
 * - api_key, oauth_token → Anthropic (Claude)
 * - codex_oauth → OpenAI (Codex)
 *
 * @param authType - The stored authentication type
 * @returns The detected provider
 */
export function detectProvider(authType: string): AgentProvider {
  switch (authType) {
    // Anthropic authentication types
    case 'api_key':
    case 'oauth_token':
      return 'anthropic';

    // Codex authentication (ChatGPT Plus via app-server OAuth)
    case 'codex_oauth':
      return 'openai';

    // Default to Anthropic for unknown types
    default:
      return 'anthropic';
  }
}

/**
 * Create the appropriate backend based on configuration.
 *
 * @param config - Backend configuration including provider selection
 * @returns An initialized AgentBackend instance
 * @throws Error if the requested provider is not yet implemented
 *
 * @example
 * ```typescript
 * // Create Anthropic (Claude) backend
 * const backend = createBackend({
 *   provider: 'anthropic',
 *   workspace: myWorkspace,
 *   model: 'claude-sonnet-4-5-20250929',
 * });
 *
 * // Create Codex backend (uses app-server mode)
 * const codexBackend = createBackend({
 *   provider: 'openai',
 *   workspace: myWorkspace,
 * });
 * ```
 */
export function createBackend(config: BackendConfig): AgentBackend {
  switch (config.provider) {
    case 'anthropic':
      return new ClaudeBackend(config);

    case 'openai':
      // Codex uses app-server mode with JSON-RPC
      // Auth is handled by the app-server (ChatGPT Plus OAuth or ~/.codex/auth.json)
      return new CodexBackend(config);

    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/**
 * Get list of currently available providers.
 *
 * @returns Array of provider identifiers that have working implementations
 */
export function getAvailableProviders(): AgentProvider[] {
  return ['anthropic', 'openai'];
}

/**
 * Check if a provider is available for use.
 *
 * @param provider - Provider to check
 * @returns true if the provider has a working implementation
 */
export function isProviderAvailable(provider: AgentProvider): boolean {
  return getAvailableProviders().includes(provider);
}
