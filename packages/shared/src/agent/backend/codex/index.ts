/**
 * Codex Backend Module
 *
 * Exports the CodexBackend implementation that uses the Codex app-server protocol.
 * Communicates via JSON-RPC over stdio with `codex app-server`.
 */

export { CodexBackend } from './backend.ts';
export { EventAdapter } from './event-adapter.ts';
