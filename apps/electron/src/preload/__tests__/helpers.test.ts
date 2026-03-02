import { beforeEach, describe, expect, it, mock } from 'bun:test'

const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

const invokeMock = mock((channel: string, ...args: unknown[]) => Promise.resolve({ channel, args }))
const sendMock = mock((channel: string, ...args: unknown[]) => ({ channel, args }))
const onMock = mock((channel: string, handler: (...args: unknown[]) => void) => {
  if (!listeners.has(channel)) listeners.set(channel, new Set())
  listeners.get(channel)!.add(handler)
})
const removeListenerMock = mock((channel: string, handler: (...args: unknown[]) => void) => {
  listeners.get(channel)?.delete(handler)
})

mock.module('electron', () => ({
  ipcRenderer: {
    invoke: invokeMock,
    send: sendMock,
    on: onMock,
    removeListener: removeListenerMock,
  },
  ipcMain: {
    handle: mock(() => undefined),
    on: mock(() => undefined),
  },
  app: {
    isPackaged: false,
    getAppPath: () => '/',
    quit: () => undefined,
    dock: { setIcon: () => undefined, setBadge: () => undefined },
  },
  nativeTheme: { shouldUseDarkColors: false, on: mock(() => undefined), removeListener: mock(() => undefined) },
  nativeImage: {
    createFromPath: () => ({ isEmpty: () => true }),
    createFromDataURL: () => ({}),
  },
  dialog: {
    showOpenDialog: mock(async () => ({ canceled: true, filePaths: [] })),
    showMessageBox: mock(async () => ({ response: 0 })),
  },
  shell: {
    openExternal: mock(async () => undefined),
    openPath: mock(async () => ''),
    showItemInFolder: mock(() => undefined),
  },
  BrowserWindow: {
    fromWebContents: () => null,
    getFocusedWindow: () => null,
    getAllWindows: () => [],
  },
  BrowserView: class {},
  Menu: {
    buildFromTemplate: () => ({ popup: () => undefined }),
  },
  session: {},
}))

function emit(channel: string, ...args: unknown[]): void {
  for (const handler of listeners.get(channel) ?? []) {
    handler({} as unknown, ...args)
  }
}

describe('preload helpers', () => {
  beforeEach(() => {
    listeners.clear()
    invokeMock.mockClear()
    sendMock.mockClear()
    onMock.mockClear()
    removeListenerMock.mockClear()
  })

  it('invoke forwards channel and args', async () => {
    const { invoke } = await import('../helpers')
    const call = invoke<(...args: [string, number]) => Promise<{ ok: boolean }>>('test:invoke')

    await call('hello', 42)

    expect(invokeMock).toHaveBeenCalledWith('test:invoke', 'hello', 42)
  })

  it('send forwards channel and args', async () => {
    const { send } = await import('../helpers')
    const fire = send<(...args: [string, number]) => void>('test:send')

    fire('hello', 7)

    expect(sendMock).toHaveBeenCalledWith('test:send', 'hello', 7)
  })

  it('listenOne forwards the first payload argument', async () => {
    const { listenOne } = await import('../helpers')
    const received: string[] = []

    const cleanup = listenOne<string>('event:single')((value) => {
      received.push(value)
    })

    emit('event:single', 'first', 'second')
    cleanup()
    emit('event:single', 'ignored')

    expect(received).toEqual(['first'])
  })

  it('listenMany forwards all payload arguments in order', async () => {
    const { listenMany } = await import('../helpers')
    const received: Array<[string, number, boolean]> = []

    const cleanup = listenMany<[string, number, boolean]>('event:many')((a, b, c) => {
      received.push([a, b, c])
    })

    emit('event:many', 'value', 3, true)
    cleanup()

    expect(received).toEqual([['value', 3, true]])
  })

  it('listenVoid ignores payload and only signals callback', async () => {
    const { listenVoid } = await import('../helpers')
    let count = 0

    const cleanup = listenVoid('event:void')(() => {
      count += 1
    })

    emit('event:void', 'payload')
    cleanup()
    emit('event:void', 'ignored')

    expect(count).toBe(1)
  })
})
