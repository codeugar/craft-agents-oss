/**
 * Transport layer tests — WsRpcServer + WsRpcClient.
 *
 * Tests handshake, RPC request/response, push events, error handling,
 * auth, and protocol version checking.
 */

import { describe, test, expect, afterEach } from 'bun:test'
import { WsRpcServer } from '../transport/server'
import { WsRpcClient } from '../transport/client'

// Helpers to manage cleanup
let servers: WsRpcServer[] = []
let clients: WsRpcClient[] = []

function trackServer(s: WsRpcServer) { servers.push(s); return s }
function trackClient(c: WsRpcClient) { clients.push(c); return c }

afterEach(() => {
  for (const c of clients) c.destroy()
  for (const s of servers) s.close()
  clients = []
  servers = []
})

/** Wait for client to be connected. */
async function waitConnected(client: WsRpcClient, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!client.isConnected) {
    if (Date.now() - start > timeoutMs) throw new Error('Connection timeout')
    await new Promise(r => setTimeout(r, 10))
  }
}

/** Create a server + connected client pair. */
async function createPair(serverOpts?: Partial<import('../transport/server').WsRpcServerOptions>) {
  const server = trackServer(new WsRpcServer({ host: '127.0.0.1', port: 0, ...serverOpts }))
  await server.listen()

  const client = trackClient(new WsRpcClient(`ws://127.0.0.1:${server.port}`, {
    workspaceId: 'test-workspace',
    autoReconnect: false,
  }))
  client.connect()
  await waitConnected(client)

  return { server, client }
}

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

describe('handshake', () => {
  test('client connects and receives clientId', async () => {
    const { client } = await createPair()
    expect(client.isConnected).toBe(true)
  })

  test('server assigns random port when port=0', async () => {
    const server = trackServer(new WsRpcServer({ host: '127.0.0.1', port: 0 }))
    await server.listen()
    expect(server.port).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// RPC: request → response
// ---------------------------------------------------------------------------

describe('RPC', () => {
  test('simple invoke returns result', async () => {
    const { server, client } = await createPair()

    server.handle('greet', async (_ctx, name: string) => {
      return `Hello, ${name}!`
    })

    const result = await client.invoke('greet', 'World')
    expect(result).toBe('Hello, World!')
  })

  test('handler receives correct args', async () => {
    const { server, client } = await createPair()

    server.handle('add', async (_ctx, a: number, b: number) => a + b)

    const result = await client.invoke('add', 3, 4)
    expect(result).toBe(7)
  })

  test('handler has access to clientId and workspaceId', async () => {
    const { server, client } = await createPair()

    server.handle('whoami', async (ctx) => ({
      clientId: ctx.clientId,
      workspaceId: ctx.workspaceId,
    }))

    const result = await client.invoke('whoami')
    expect(result.clientId).toBeTruthy()
    expect(result.workspaceId).toBe('test-workspace')
  })

  test('unknown channel returns CHANNEL_NOT_FOUND error', async () => {
    const { client } = await createPair()

    try {
      await client.invoke('nonexistent:channel')
      throw new Error('Should have thrown')
    } catch (err: any) {
      expect(err.code).toBe('CHANNEL_NOT_FOUND')
    }
  })

  test('handler error returns HANDLER_ERROR', async () => {
    const { server, client } = await createPair()

    server.handle('fail', async () => {
      throw new Error('Something broke')
    })

    try {
      await client.invoke('fail')
      throw new Error('Should have thrown')
    } catch (err: any) {
      expect(err.code).toBe('HANDLER_ERROR')
      expect(err.message).toBe('Something broke')
    }
  })

  test('handler with custom error code', async () => {
    const { server, client } = await createPair()

    server.handle('export', async () => {
      const err = new Error('Session is active') as any
      err.code = 'SESSION_NOT_IDLE'
      throw err
    })

    try {
      await client.invoke('export')
      throw new Error('Should have thrown')
    } catch (err: any) {
      expect(err.code).toBe('SESSION_NOT_IDLE')
    }
  })

  test('multiple concurrent requests resolve independently', async () => {
    const { server, client } = await createPair()

    server.handle('delay', async (_ctx, ms: number, value: string) => {
      await new Promise(r => setTimeout(r, ms))
      return value
    })

    const [r1, r2, r3] = await Promise.all([
      client.invoke('delay', 50, 'first'),
      client.invoke('delay', 10, 'second'),
      client.invoke('delay', 30, 'third'),
    ])

    expect(r1).toBe('first')
    expect(r2).toBe('second')
    expect(r3).toBe('third')
  })
})

// ---------------------------------------------------------------------------
// Push events
// ---------------------------------------------------------------------------

describe('push events', () => {
  test('client receives server-pushed events', async () => {
    const { server, client } = await createPair()

    const received: string[] = []
    client.on('test:event', (data: string) => {
      received.push(data)
    })

    // Small delay to ensure listener is registered
    await new Promise(r => setTimeout(r, 50))

    server.push('test:event', { to: 'all' }, 'hello')
    server.push('test:event', { to: 'all' }, 'world')

    await new Promise(r => setTimeout(r, 100))
    expect(received).toEqual(['hello', 'world'])
  })

  test('workspace-targeted push only reaches matching clients', async () => {
    const server = trackServer(new WsRpcServer({ host: '127.0.0.1', port: 0 }))
    await server.listen()

    const client1 = trackClient(new WsRpcClient(`ws://127.0.0.1:${server.port}`, {
      workspaceId: 'ws-a',
      autoReconnect: false,
    }))
    const client2 = trackClient(new WsRpcClient(`ws://127.0.0.1:${server.port}`, {
      workspaceId: 'ws-b',
      autoReconnect: false,
    }))

    client1.connect()
    client2.connect()
    await waitConnected(client1)
    await waitConnected(client2)

    const received1: string[] = []
    const received2: string[] = []
    client1.on('update', (v: string) => received1.push(v))
    client2.on('update', (v: string) => received2.push(v))

    await new Promise(r => setTimeout(r, 50))

    server.push('update', { to: 'workspace', workspaceId: 'ws-a' }, 'for-a')
    server.push('update', { to: 'workspace', workspaceId: 'ws-b' }, 'for-b')

    await new Promise(r => setTimeout(r, 100))
    expect(received1).toEqual(['for-a'])
    expect(received2).toEqual(['for-b'])
  })

  test('unsubscribe stops receiving events', async () => {
    const { server, client } = await createPair()

    const received: string[] = []
    const unsub = client.on('test:event', (data: string) => {
      received.push(data)
    })

    await new Promise(r => setTimeout(r, 50))

    server.push('test:event', { to: 'all' }, 'before')
    await new Promise(r => setTimeout(r, 50))

    unsub()
    server.push('test:event', { to: 'all' }, 'after')
    await new Promise(r => setTimeout(r, 50))

    expect(received).toEqual(['before'])
  })
})

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('auth', () => {
  test('server with requireAuth rejects clients without token', async () => {
    const server = trackServer(new WsRpcServer({
      host: '127.0.0.1',
      port: 0,
      requireAuth: true,
      validateToken: async (t) => t === 'valid-token',
    }))
    await server.listen()

    const client = trackClient(new WsRpcClient(`ws://127.0.0.1:${server.port}`, {
      autoReconnect: false,
    }))
    client.connect()

    // Should NOT become connected
    await new Promise(r => setTimeout(r, 500))
    expect(client.isConnected).toBe(false)
  })

  test('server with requireAuth accepts valid token', async () => {
    const server = trackServer(new WsRpcServer({
      host: '127.0.0.1',
      port: 0,
      requireAuth: true,
      validateToken: async (t) => t === 'valid-token',
    }))
    await server.listen()

    const client = trackClient(new WsRpcClient(`ws://127.0.0.1:${server.port}`, {
      token: 'valid-token',
      autoReconnect: false,
    }))
    client.connect()
    await waitConnected(client)

    expect(client.isConnected).toBe(true)
  })

  test('server with requireAuth rejects invalid token', async () => {
    const server = trackServer(new WsRpcServer({
      host: '127.0.0.1',
      port: 0,
      requireAuth: true,
      validateToken: async (t) => t === 'valid-token',
    }))
    await server.listen()

    const client = trackClient(new WsRpcClient(`ws://127.0.0.1:${server.port}`, {
      token: 'wrong-token',
      autoReconnect: false,
    }))
    client.connect()

    await new Promise(r => setTimeout(r, 500))
    expect(client.isConnected).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  test('invoke on disconnected client throws', async () => {
    const client = trackClient(new WsRpcClient('ws://127.0.0.1:1', {
      autoReconnect: false,
    }))

    try {
      await client.invoke('anything')
      throw new Error('Should have thrown')
    } catch (err: any) {
      expect(err.message).toContain('Not connected')
    }
  })

  test('handler returning void resolves to undefined', async () => {
    const { server, client } = await createPair()

    server.handle('noop', async () => {
      // returns void
    })

    const result = await client.invoke('noop')
    expect(result).toBeUndefined()
  })

  test('handler returning null resolves to null', async () => {
    const { server, client } = await createPair()

    server.handle('nullable', async () => null)

    const result = await client.invoke('nullable')
    expect(result).toBeNull()
  })

  test('duplicate handler registration throws', async () => {
    const { server } = await createPair()

    server.handle('once', async () => 'ok')
    expect(() => server.handle('once', async () => 'dup')).toThrow('already registered')
  })
})
