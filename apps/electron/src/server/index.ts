/**
 * Headless Bun entry point — runs the Craft Agent server without Electron.
 *
 * Usage:
 *   CRAFT_SERVER_TOKEN=<secret> bun run src/server/index.ts
 *
 * Environment:
 *   CRAFT_SERVER_TOKEN   — required unless options override in host bootstrap
 *   CRAFT_RPC_HOST       — bind address (default: 127.0.0.1)
 *   CRAFT_RPC_PORT       — bind port (default: 9100)
 *   CRAFT_APP_ROOT       — app root path (default: cwd)
 *   CRAFT_RESOURCES_PATH — resources path (default: cwd/resources)
 *   CRAFT_IS_PACKAGED    — 'true' for production (default: false)
 *   CRAFT_VERSION        — app version (default: 0.0.0-dev)
 *   CRAFT_DEBUG          — 'true' for debug logging
 */

// ── Virtual module shims ────────────────────────────────────────────────────
// Must be registered BEFORE any transitive import of electron-specific modules.
// Bun resolves ALL static imports before executing any code in the file, so this
// file must contain NO static imports of our own modules — only `bun` itself.

import { plugin } from 'bun'

plugin({
  name: 'headless-electron-shims',
  setup(build) {
    // Minimal retained shim:
    // electron-log/main → console-based logger with .scope() API
    //
    // Why retained: main/logger.ts is still imported by headless-reachable modules
    // (sessions + model fetchers). See docs/headless-shim-import-map.md.
    build.module('electron-log/main', () => {
      const makeLogger = (prefix?: string) => {
        const fmt = (...args: unknown[]) =>
          prefix ? [`[${prefix}]`, ...args] : args
        return {
          info: (...args: unknown[]) => console.log(...fmt(...args)),
          warn: (...args: unknown[]) => console.warn(...fmt(...args)),
          error: (...args: unknown[]) => console.error(...fmt(...args)),
          debug: (...args: unknown[]) => {
            if (process.env.CRAFT_DEBUG === 'true' || process.env.CRAFT_IS_PACKAGED !== 'true') {
              console.debug(...fmt(...args))
            }
          },
        }
      }

      const log: any = makeLogger()
      log.scope = (name: string) => makeLogger(name)
      log.transports = {
        file: { format: null, maxSize: 0, level: false, getFile: () => null },
        console: { format: null, level: false },
      }

      return { exports: { default: log }, loader: 'object' }
    })
  },
})

// ── Boot ─────────────────────────────────────────────────────────────────────
// Dynamic import so the shims above are active before any headless-reachable
// modules are resolved.

process.env.CRAFT_IS_PACKAGED ??= 'false'

await import('./start.ts')
