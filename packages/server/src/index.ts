#!/usr/bin/env bun
/**
 * @craft-agent/server — standalone headless Craft Agent server.
 *
 * Usage:
 *   CRAFT_SERVER_TOKEN=<secret> bun run packages/server/src/index.ts
 *
 * Environment:
 *   CRAFT_SERVER_TOKEN   — required bearer token for client auth
 *   CRAFT_RPC_HOST       — bind address (default: 127.0.0.1)
 *   CRAFT_RPC_PORT       — bind port (default: 9100)
 *   CRAFT_APP_ROOT       — app root path (default: cwd)
 *   CRAFT_RESOURCES_PATH — resources path (default: cwd/resources)
 *   CRAFT_IS_PACKAGED    — 'true' for production (default: false)
 *   CRAFT_VERSION        — app version (default: 0.0.0-dev)
 *   CRAFT_DEBUG          — 'true' for debug logging
 *
 * NOTE: This is the target entry point for standalone server deployment.
 * Until handler files are fully extracted from apps/electron into
 * @craft-agent/server-core, use apps/electron/src/server/index.ts instead.
 *
 * Prerequisite for standalone operation:
 *   - Core handler files moved to @craft-agent/server-core
 *   - SessionManager extracted or re-exported from server-core
 *
 * See docs/server-domain-extraction-map.md for the extraction roadmap.
 */

process.env.CRAFT_IS_PACKAGED ??= 'false'

console.error(
  '@craft-agent/server: standalone entry not yet wired.\n'
  + 'Use `bun run apps/electron/src/server/index.ts` for now.\n'
  + 'See docs/server-domain-extraction-map.md for extraction roadmap.',
)
process.exit(1)
