import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { SessionManager, createManagedSession } from './SessionManager.ts'

// Regression coverage for the stale-Pi-subprocess bug where toggling
// `supportsImages` on a custom-endpoint model wrote to disk but never reached
// the live agent.
//
// Two failure modes are guarded here:
//   1. `getOrCreateAgent` deferred refresh whenever `managed.isProcessing` was
//      true, but `sendMessage` flips that flag *before* calling
//      `getOrCreateAgent` — which made the refresh branch dead code on the
//      send path. The new gate uses only `agent.isProcessing()`.
//   2. Saving a connection had no notification path to active sessions, so
//      capability changes only propagated lazily after the next send.
//      `refreshConnectionRuntime` now pushes updates from the SAVE handler.

interface AgentStub {
  isProcessing: () => boolean
  updateRuntimeConfig: jest.Mock
  dispose: () => void
  disposeForRestart?: () => Promise<void>
}

function createAgentStub(opts: { isProcessing?: boolean; refreshSucceeds?: boolean } = {}): AgentStub {
  return {
    isProcessing: () => opts.isProcessing ?? false,
    updateRuntimeConfig: jest.fn().mockResolvedValue(opts.refreshSucceeds ?? true),
    dispose: () => { /* no-op for tests */ },
  }
}

function injectSession(
  sm: SessionManager,
  id: string,
  workspaceRoot: string,
  llmConnection: string,
  agent: AgentStub | null,
  opts: { backendRuntimeSignature?: string; isProcessing?: boolean } = {},
) {
  const workspace = {
    id: 'ws_test',
    name: 'Test Workspace',
    rootPath: workspaceRoot,
    createdAt: Date.now(),
  }
  const managed = createManagedSession(
    { id, name: id, llmConnection },
    workspace as never,
    { messagesLoaded: true },
  ) as unknown as { agent: AgentStub | null; backendRuntimeSignature?: string; isProcessing: boolean; llmConnection?: string }
  managed.agent = agent
  // Force a stale signature so the helper's comparison always reaches the
  // refresh branch — the signature it computes from real disk config will
  // never equal this sentinel.
  managed.backendRuntimeSignature = opts.backendRuntimeSignature ?? '__stale_signature_for_test__'
  managed.isProcessing = opts.isProcessing ?? false
  managed.llmConnection = llmConnection
  ;(sm as unknown as { sessions: Map<string, unknown> }).sessions.set(id, managed)
  return managed
}

describe('refreshConnectionRuntime', () => {
  let tmpRoot: string
  let sm: SessionManager

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'sm-refresh-'))
    sm = new SessionManager()
  })

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('pushes updateRuntimeConfig to sessions on the matching connection slug', async () => {
    const matchingAgent = createAgentStub()
    const otherAgent = createAgentStub()
    injectSession(sm, 'matching', tmpRoot, 'slug-A', matchingAgent)
    injectSession(sm, 'other', tmpRoot, 'slug-B', otherAgent)

    await sm.refreshConnectionRuntime('slug-A')

    expect(matchingAgent.updateRuntimeConfig).toHaveBeenCalledTimes(1)
    expect(otherAgent.updateRuntimeConfig).not.toHaveBeenCalled()
  })

  it('skips sessions whose agent is mid-stream (defers, does not yank)', async () => {
    const busyAgent = createAgentStub({ isProcessing: true })
    injectSession(sm, 'busy', tmpRoot, 'slug-A', busyAgent)

    await sm.refreshConnectionRuntime('slug-A')

    expect(busyAgent.updateRuntimeConfig).not.toHaveBeenCalled()
  })

  it('does not defer just because managed.isProcessing is true (Fix 1 regression)', async () => {
    // sendMessage flips managed.isProcessing=true *before* calling
    // getOrCreateAgent → tryRefreshAgentRuntime. The pre-fix gate
    // `managed.isProcessing || agent.isProcessing()` was therefore always true
    // on the send path, making the refresh branch dead code. The fix narrows
    // the gate to `agent.isProcessing()` only — which is what actually means
    // "an in-flight stream we shouldn't yank."
    const idleAgent = createAgentStub({ isProcessing: false })
    injectSession(sm, 'sending', tmpRoot, 'slug-A', idleAgent, { isProcessing: true })

    await sm.refreshConnectionRuntime('slug-A')

    expect(idleAgent.updateRuntimeConfig).toHaveBeenCalledTimes(1)
  })

  it('is a no-op when there is no agent yet (cold session)', async () => {
    injectSession(sm, 'cold', tmpRoot, 'slug-A', null)

    await expect(sm.refreshConnectionRuntime('slug-A')).resolves.toBeUndefined()
  })

  it('disposes the runtime when in-place refresh fails so the next send rebuilds it', async () => {
    const failingAgent = createAgentStub({ refreshSucceeds: false })
    const managed = injectSession(sm, 'failing', tmpRoot, 'slug-A', failingAgent)

    await sm.refreshConnectionRuntime('slug-A')

    expect(failingAgent.updateRuntimeConfig).toHaveBeenCalledTimes(1)
    expect(managed.agent).toBeNull()
  })
})
