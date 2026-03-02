import { describe, it, expect, mock } from 'bun:test'

mock.module('electron-log/main', () => {
  const scopedLogger = {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  }

  return {
    default: {
      transports: {
        file: {
          format: null,
          maxSize: 0,
          level: 'debug',
          getFile: () => ({ path: '/tmp/mock.log' }),
        },
        console: {
          format: null,
          level: 'debug',
        },
      },
      scope: () => scopedLogger,
    },
  }
})

mock.module('electron', () => ({
  BrowserWindow: class {},
  shell: {
    openExternal: mock(async () => {}),
  },
  nativeTheme: {
    shouldUseDarkColors: false,
    on: mock(() => {}),
    removeListener: mock(() => {}),
  },
  Menu: {
    buildFromTemplate: mock(() => ({ popup: mock(() => {}) })),
  },
  app: {
    isPackaged: true,
    getAppPath: () => '/',
    quit: () => undefined,
    dock: { setIcon: () => undefined, setBadge: () => undefined },
  },
  ipcMain: {
    handle: mock(() => undefined),
    on: mock(() => undefined),
  },
  ipcRenderer: {
    invoke: mock(async () => undefined),
    send: mock(() => undefined),
    on: mock(() => undefined),
    removeListener: mock(() => undefined),
  },
  dialog: {
    showOpenDialog: mock(async () => ({ canceled: true, filePaths: [] })),
    showMessageBox: mock(async () => ({ response: 0 })),
  },
  nativeImage: {
    createFromPath: () => ({ isEmpty: () => true }),
    createFromDataURL: () => ({}),
  },
  BrowserView: class {},
  session: {},
}))

interface MockWindowOptions {
  throwOnSend?: boolean
  windowDestroyed?: boolean
  webContentsDestroyed?: boolean
  mainFrame?: boolean
}

function createManagedWindow(id: number, options: MockWindowOptions = {}) {
  const send = mock((_channel: string, _payload?: unknown) => {
    if (options.throwOnSend) {
      throw new Error('window closing')
    }
  })

  return {
    managed: {
      workspaceId: 'ws-1',
      window: {
        isDestroyed: () => options.windowDestroyed ?? false,
        webContents: {
          id,
          isDestroyed: () => options.webContentsDestroyed ?? false,
          mainFrame: options.mainFrame === false ? null : {},
          send,
        },
      },
    },
    send,
  }
}

describe('WindowManager broadcast helpers', () => {
  it('broadcastToAllExcept skips the excluded sender id', async () => {
    const { WindowManager } = await import('../window-manager')
    const { IPC_CHANNELS } = await import('../../shared/types')

    const first = createManagedWindow(1)
    const second = createManagedWindow(2)

    const manager = new WindowManager() as any
    manager.windows = new Map([
      [1, first.managed],
      [2, second.managed],
    ])

    manager.broadcastToAllExcept(2, IPC_CHANNELS.theme.PREFERENCES_CHANGED, {
      mode: 'dark',
      colorTheme: 'default',
      font: 'system',
    })

    expect(first.send).toHaveBeenCalledTimes(1)
    expect(second.send).not.toHaveBeenCalled()
  })

  it('broadcastToAllExcept continues when one window throws during send', async () => {
    const { WindowManager } = await import('../window-manager')
    const { IPC_CHANNELS } = await import('../../shared/types')

    const throwingWindow = createManagedWindow(1, { throwOnSend: true })
    const healthyWindow = createManagedWindow(2)

    const manager = new WindowManager() as any
    manager.windows = new Map([
      [1, throwingWindow.managed],
      [2, healthyWindow.managed],
    ])

    expect(() => {
      manager.broadcastToAllExcept(999, IPC_CHANNELS.theme.WORKSPACE_THEME_CHANGED, {
        workspaceId: 'ws-1',
        themeId: 'solarized',
      })
    }).not.toThrow()

    expect(healthyWindow.send).toHaveBeenCalledTimes(1)
  })
})
