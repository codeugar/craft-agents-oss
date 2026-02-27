import { describe, expect, it } from 'bun:test'

type StoredMessage = { id: string }
type StoredSession = {
  sdkSessionId?: string
  messages: StoredMessage[]
}

type BranchRequest = {
  branchFromSessionId?: string
  branchFromMessageId?: string
}

function validateBranchLikeSessionManager(args: {
  request: BranchRequest
  targetWorkspaceRootPath: string
  targetProvider?: 'anthropic' | 'pi'
  sourceManagedWorkspaceRootPath?: string
  sourceManagedSdkSessionId?: string
  sourceSession?: StoredSession
}) {
  const { request, targetWorkspaceRootPath, targetProvider = 'anthropic', sourceManagedWorkspaceRootPath, sourceManagedSdkSessionId, sourceSession } = args

  if (request.branchFromSessionId || request.branchFromMessageId) {
    if (!request.branchFromSessionId || !request.branchFromMessageId) {
      throw new Error('Invalid branch request: both branchFromSessionId and branchFromMessageId are required')
    }

    if (targetProvider === 'pi') {
      throw new Error('Branching is not supported for the selected LLM connection')
    }

    if (sourceManagedWorkspaceRootPath && sourceManagedWorkspaceRootPath !== targetWorkspaceRootPath) {
      throw new Error('Invalid branch request: source session belongs to a different workspace')
    }

    if (!sourceSession) {
      throw new Error(`Invalid branch request: source session ${request.branchFromSessionId} not found`)
    }

    const branchIdx = sourceSession.messages.findIndex(m => m.id === request.branchFromMessageId)
    if (branchIdx === -1) {
      throw new Error(`Invalid branch request: message ${request.branchFromMessageId} not found in source session`)
    }

    return {
      sourceSessionId: request.branchFromSessionId,
      sourceMessageId: request.branchFromMessageId,
      copiedMessages: sourceSession.messages.slice(0, branchIdx + 1),
      branchFromSdkSessionId: sourceManagedSdkSessionId || sourceSession.sdkSessionId,
    }
  }

  return undefined
}

describe('session branching validation semantics', () => {
  it('creates validated branch payload only for valid source/message', () => {
    const sourceSession: StoredSession = {
      sdkSessionId: 'sdk-parent',
      messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
    }

    const result = validateBranchLikeSessionManager({
      request: { branchFromSessionId: 'source-1', branchFromMessageId: 'm2' },
      targetWorkspaceRootPath: '/ws-a',
      sourceManagedWorkspaceRootPath: '/ws-a',
      sourceSession,
    })

    expect(result).toBeDefined()
    expect(result?.copiedMessages.map(m => m.id)).toEqual(['m1', 'm2'])
    expect(result?.branchFromSdkSessionId).toBe('sdk-parent')
  })

  it('rejects cross-workspace branch request', () => {
    expect(() => validateBranchLikeSessionManager({
      request: { branchFromSessionId: 'source-1', branchFromMessageId: 'm1' },
      targetWorkspaceRootPath: '/ws-a',
      sourceManagedWorkspaceRootPath: '/ws-b',
      sourceSession: { messages: [{ id: 'm1' }] },
    })).toThrow('source session belongs to a different workspace')
  })

  it('rejects missing branch message id in source session', () => {
    expect(() => validateBranchLikeSessionManager({
      request: { branchFromSessionId: 'source-1', branchFromMessageId: 'missing' },
      targetWorkspaceRootPath: '/ws-a',
      sourceManagedWorkspaceRootPath: '/ws-a',
      sourceSession: { messages: [{ id: 'm1' }] },
    })).toThrow('not found in source session')
  })

  it('rejects branching when target provider does not support it (pi)', () => {
    expect(() => validateBranchLikeSessionManager({
      request: { branchFromSessionId: 'source-1', branchFromMessageId: 'm1' },
      targetWorkspaceRootPath: '/ws-a',
      targetProvider: 'pi',
      sourceManagedWorkspaceRootPath: '/ws-a',
      sourceSession: { messages: [{ id: 'm1' }] },
    })).toThrow('Branching is not supported')
  })
})
