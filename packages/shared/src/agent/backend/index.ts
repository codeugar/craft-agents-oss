/**
 * Backend Abstraction Layer
 *
 * This module provides a unified interface for AI backends (Claude, OpenAI, etc.)
 * allowing CraftAgent to switch between providers seamlessly.
 *
 * Usage:
 * ```typescript
 * import { createBackend, type AgentBackend } from '@craft-agent/shared/agent/backend';
 *
 * const backend = createBackend({
 *   provider: 'anthropic',
 *   workspace: myWorkspace,
 *   model: 'claude-sonnet-4-5-20250929',
 * });
 *
 * for await (const event of backend.chat('Hello')) {
 *   console.log(event);
 * }
 * ```
 */

// Core types
export type {
  AgentBackend,
  AgentCapabilities,
  AgentProvider,
  BackendConfig,
  ModelDefinition,
  ThinkingLevelDefinition,
  PermissionCallback,
  PlanCallback,
  AuthCallback,
  SourceChangeCallback,
  SourceActivationCallback,
  ChatOptions,
  RecoveryMessage,
  SdkMcpServerConfig,
} from './types.ts';

// Enums need to be exported as values, not just types
export { AbortReason } from './types.ts';

// Factory
export { createBackend, detectProvider, getAvailableProviders, isProviderAvailable } from './factory.ts';

// Backend implementations (for direct instantiation if needed)
export { ClaudeBackend } from './claude.ts';
export { CodexBackend } from './codex/index.ts';
