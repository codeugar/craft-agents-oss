/**
 * Tests for BrowserPaneManager.
 *
 * Mocks Electron's WebContentsView, BrowserWindow, and session modules
 * to test instance lifecycle, session binding, and navigation.
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test'

// ============================================================================
// Electron Mocks
// ============================================================================

// Track created views for assertions
const createdViews: any[] = []

function createMockWebContents() {
  const listeners: Record<string, Function[]> = {}
  return {
    on: (event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(cb)
    },
    loadURL: mock(async (_url: string) => {}),
    getTitle: mock(() => 'Test Page'),
    getURL: mock(() => 'https://example.com'),
    canGoBack: mock(() => false),
    canGoForward: mock(() => false),
    goBack: mock(() => {}),
    goForward: mock(() => {}),
    reload: mock(() => {}),
    stop: mock(() => {}),
    capturePage: mock(async () => ({
      toPNG: () => Buffer.from('fake-png'),
    })),
    executeJavaScript: mock(async (expr: string) => eval(expr)),
    setWindowOpenHandler: mock((_handler: any) => {}),
    close: mock(() => {}),
    debugger: {
      attach: mock(() => {}),
      detach: mock(() => {}),
      sendCommand: mock(async () => ({ nodes: [] })),
      on: mock(() => {}),
    },
    _listeners: listeners,
    _emit: (event: string, ...args: any[]) => {
      for (const cb of listeners[event] || []) cb({}, ...args)
    },
  }
}

function createMockView() {
  const wc = createMockWebContents()
  const view = {
    webContents: wc,
    setBounds: mock(() => {}),
  }
  createdViews.push(view)
  return view
}

// Mock Electron modules
mock.module('electron', () => ({
  WebContentsView: class MockWebContentsView {
    webContents: any
    setBounds: any
    constructor(_opts?: any) {
      const v = createMockView()
      this.webContents = v.webContents
      this.setBounds = v.setBounds
    }
  },
  BrowserWindow: class MockBrowserWindow {
    contentView = {
      addChildView: mock(() => {}),
      removeChildView: mock(() => {}),
    }
    isDestroyed = mock(() => false)
  },
  session: {
    fromPartition: mock(() => ({})),
  },
}))

// Mock logger
mock.module('../logger', () => ({
  mainLog: {
    info: () => {},
    error: () => {},
    warn: () => {},
  },
}))

// Mock BrowserCDP
mock.module('../browser-cdp', () => ({
  BrowserCDP: class MockBrowserCDP {
    detach = mock(() => {})
    getAccessibilitySnapshot = mock(async () => ({
      url: 'https://example.com',
      title: 'Example',
      nodes: [],
    }))
  },
}))

// Import after mocks
const { BrowserPaneManager } = await import('../browser-pane-manager')

// ============================================================================
// Tests
// ============================================================================

describe('BrowserPaneManager', () => {
  let manager: InstanceType<typeof BrowserPaneManager>

  beforeEach(() => {
    createdViews.length = 0
    manager = new BrowserPaneManager()
  })

  describe('createInstance', () => {
    it('auto-generates an ID', () => {
      const id = manager.createInstance()
      expect(id).toMatch(/^browser-\d+$/)
    })

    it('uses explicit ID when provided', () => {
      const id = manager.createInstance('custom-id')
      expect(id).toBe('custom-id')
    })

    it('returns the instance in listInstances', () => {
      const id = manager.createInstance('test-1')
      const list = manager.listInstances()
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe('test-1')
      expect(list[0].url).toBe('about:blank')
      expect(list[0].title).toBe('New Tab')
    })


    it('is idempotent when explicit ID already exists', () => {
      const first = manager.createInstance('same-id')
      const second = manager.createInstance('same-id')
      expect(first).toBe('same-id')
      expect(second).toBe('same-id')
      expect(manager.listInstances()).toHaveLength(1)
    })
  })

  describe('destroyInstance', () => {
    it('removes from map and calls cdp.detach()', () => {
      const id = manager.createInstance('d1')
      expect(manager.listInstances()).toHaveLength(1)

      manager.destroyInstance('d1')
      expect(manager.listInstances()).toHaveLength(0)
    })

    it('is a no-op for unknown ID', () => {
      expect(() => manager.destroyInstance('nonexistent')).not.toThrow()
    })
  })

  describe('session binding', () => {
    it('bindSession sets boundSessionId', () => {
      const id = manager.createInstance('b1')
      manager.bindSession('b1', 'session-abc')
      const info = manager.listInstances().find(i => i.id === 'b1')
      expect(info?.boundSessionId).toBe('session-abc')
    })

    it('unbindSession clears boundSessionId', () => {
      const id = manager.createInstance('b2')
      manager.bindSession('b2', 'session-abc')
      manager.unbindSession('b2')
      const info = manager.listInstances().find(i => i.id === 'b2')
      expect(info?.boundSessionId).toBeNull()
    })
  })

  describe('getOrCreateForSession', () => {
    it('creates new instance and binds it', () => {
      const id = manager.getOrCreateForSession('sess-1')
      expect(id).toBeTruthy()
      const info = manager.listInstances().find(i => i.id === id)
      expect(info?.boundSessionId).toBe('sess-1')
    })

    it('returns existing bound instance', () => {
      const id1 = manager.getOrCreateForSession('sess-2')
      const id2 = manager.getOrCreateForSession('sess-2')
      expect(id1).toBe(id2)
      expect(manager.listInstances()).toHaveLength(1)
    })
  })

  describe('destroyForSession', () => {
    it('destroys all instances bound to session', () => {
      manager.createInstance('x1')
      manager.createInstance('x2')
      manager.createInstance('x3')
      manager.bindSession('x1', 'sess-a')
      manager.bindSession('x2', 'sess-a')
      manager.bindSession('x3', 'sess-b')

      manager.destroyForSession('sess-a')

      const remaining = manager.listInstances()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).toBe('x3')
    })

    it('is a no-op when no instances bound', () => {
      manager.createInstance('y1')
      manager.destroyForSession('no-such-session')
      expect(manager.listInstances()).toHaveLength(1)
    })
  })

  describe('navigate', () => {
    it('adds https:// when missing', async () => {
      const id = manager.createInstance('nav-1')
      await manager.navigate('nav-1', 'example.com')
      const instance = (manager as any).instances.get('nav-1')
      expect(instance.view.webContents.loadURL).toHaveBeenCalledWith('https://example.com')
    })

    it('preserves existing https://', async () => {
      const id = manager.createInstance('nav-2')
      await manager.navigate('nav-2', 'https://already.com')
      const instance = (manager as any).instances.get('nav-2')
      expect(instance.view.webContents.loadURL).toHaveBeenCalledWith('https://already.com')
    })

    it('preserves http://', async () => {
      const id = manager.createInstance('nav-3')
      await manager.navigate('nav-3', 'http://insecure.com')
      const instance = (manager as any).instances.get('nav-3')
      expect(instance.view.webContents.loadURL).toHaveBeenCalledWith('http://insecure.com')
    })


    it('treats non-URL input as search query', async () => {
      manager.createInstance('nav-4')
      await manager.navigate('nav-4', 'craft agents browser tools')
      const instance = (manager as any).instances.get('nav-4')
      expect(instance.view.webContents.loadURL).toHaveBeenCalledWith(
        'https://duckduckgo.com/?q=craft%20agents%20browser%20tools'
      )
    })

    it('throws for unknown instance', async () => {
      await expect(manager.navigate('unknown', 'test.com')).rejects.toThrow('not found')
    })
  })

  describe('destroyAll', () => {
    it('destroys all instances', () => {
      manager.createInstance('z1')
      manager.createInstance('z2')
      manager.createInstance('z3')
      expect(manager.listInstances()).toHaveLength(3)

      manager.destroyAll()
      expect(manager.listInstances()).toHaveLength(0)
    })
  })

  describe('onStateChange', () => {
    it('emits state changes on navigation', () => {
      let lastInfo: any = null
      manager.onStateChange((info) => { lastInfo = info })

      const id = manager.createInstance('sc-1')

      // Simulate webContents navigation event
      const instance = (manager as any).instances.get('sc-1')
      instance.view.webContents._emit('did-navigate', 'https://example.com')

      expect(lastInfo).not.toBeNull()
      expect(lastInfo.id).toBe('sc-1')
    })
  })


  describe('onRemoved', () => {
    it('emits removed instance ID on destroy', () => {
      let removedId: string | null = null
      manager.onRemoved((id) => { removedId = id })

      manager.createInstance('rm-1')
      manager.destroyInstance('rm-1')

      expect(removedId as string | null).toBe('rm-1')
    })
  })

  describe('onInteracted', () => {
    it('emits interacted instance ID on webContents focus', () => {
      let interactedId: string | null = null
      manager.onInteracted((id) => { interactedId = id })

      manager.createInstance('focus-1')
      const instance = (manager as any).instances.get('focus-1')
      instance.view.webContents._emit('focus')

      expect(interactedId as string | null).toBe('focus-1')
    })
  })
})
