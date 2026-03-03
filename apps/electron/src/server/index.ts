/**
 * Headless Bun entry point — runs the Craft Agent server without Electron.
 *
 * Usage:
 *   CRAFT_SERVER_TOKEN=<secret> bun run src/server/index.ts
 *
 * Environment:
 *   CRAFT_SERVER_TOKEN  — required, WS auth token
 *   CRAFT_RPC_HOST      — bind address (default: 0.0.0.0)
 *   CRAFT_RPC_PORT      — bind port (default: 9100)
 *   CRAFT_APP_ROOT      — app root path (default: cwd)
 *   CRAFT_RESOURCES_PATH — resources path (default: cwd/resources)
 *   CRAFT_IS_PACKAGED   — 'true' for production (default: false)
 *   CRAFT_VERSION       — app version (default: 0.0.0-dev)
 *   CRAFT_DEBUG         — 'true' for debug logging
 */

// ── Virtual module shims ────────────────────────────────────────────────────
// Must be registered BEFORE any transitive import of electron-specific modules.
// Bun resolves ALL static imports before executing any code in the file, so this
// file must contain NO static imports of our own modules — only `bun` itself.

import { plugin } from 'bun'

plugin({
  name: 'headless-electron-shims',
  setup(build) {
    // electron-log/main → console-based logger with .scope() API
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

    // @sentry/electron/main → no-op error tracking
    build.module('@sentry/electron/main', () => {
      const noop = () => {}
      const sentry = {
        init: noop,
        captureException: noop,
        setUser: noop,
        withScope: (cb: (scope: any) => void) => cb({ setTag: noop, setContext: noop }),
      }
      return { exports: { ...sentry, default: sentry }, loader: 'object' }
    })

    // @sentry/electron/preload → no-op (may be imported by some modules)
    build.module('@sentry/electron/preload', () => {
      return { exports: {}, loader: 'object' }
    })

    // electron → minimal stubs for symbols used by notifications.ts, deep-link.ts, etc.
    // Only covers symbols reachable via static imports from sessions.ts chain.
    build.module('electron', () => {
      const noop = () => {}
      return {
        exports: {
          Notification: class { show() {} static isSupported() { return false } },
          app: {
            isPackaged: false,
            getAppPath: () => process.cwd(),
            getVersion: () => process.env.CRAFT_VERSION || '0.0.0-dev',
            getPath: (name: string) => name === 'home' ? process.env.HOME || '/tmp' : '/tmp',
            quit: noop,
            setBadgeCount: noop,
            dock: { setBadge: noop, setIcon: noop, bounce: () => -1 },
          },
          BrowserWindow: {
            getAllWindows: () => [],
            getFocusedWindow: () => null,
            fromWebContents: () => null,
          },
          nativeImage: {
            createFromPath: () => ({ isEmpty: () => true, toPNG: () => Buffer.alloc(0) }),
            createFromDataURL: () => ({ isEmpty: () => true }),
            createFromBuffer: () => ({ isEmpty: () => true, getSize: () => ({ width: 0, height: 0 }) }),
          },
          nativeTheme: { shouldUseDarkColors: false },
          shell: {
            openExternal: async () => {},
            openPath: async () => '',
            showItemInFolder: noop,
          },
          ipcMain: { handle: noop, on: noop, removeHandler: noop },
          dialog: {
            showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
            showMessageBox: async () => ({ response: 0 }),
          },
          Menu: { buildFromTemplate: () => ({ popup: noop }), setApplicationMenu: noop },
          BrowserView: class {},
          session: { defaultSession: { webRequest: { onBeforeSendHeaders: noop } } },
          protocol: { registerBufferProtocol: noop },
          powerSaveBlocker: { start: () => 0, stop: noop, isStarted: () => false },
          contextBridge: { exposeInMainWorld: noop },
          ipcRenderer: { sendSync: () => null, invoke: async () => null, on: noop },
        },
        loader: 'object',
      }
    })

    // electron-updater → no-op (auto-update is GUI-only)
    build.module('electron-updater', () => {
      return {
        exports: {
          autoUpdater: {
            checkForUpdates: async () => null,
            on: () => {},
            removeAllListeners: () => {},
          },
        },
        loader: 'object',
      }
    })
  },
})

// ── Boot ─────────────────────────────────────────────────────────────────────
// Dynamic import so the shims above are active before any electron-dependent
// module is resolved.

// Headless server defaults to non-packaged unless explicitly overridden.
process.env.CRAFT_IS_PACKAGED ??= 'false'

await import('./start.ts')
