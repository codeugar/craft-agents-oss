import { describe, expect, it } from 'bun:test'
import { PiAgent } from '../pi-agent.ts'
import type { BackendConfig } from '../backend/types.ts'

describe('PiAgent branching capability', () => {
  it('reports supportsBranching=false', () => {
    const config: BackendConfig = {
      provider: 'pi',
      workspace: {
        id: 'ws-test',
        name: 'Test Workspace',
        rootPath: '/tmp/craft-agent-test',
      } as any,
      session: {
        id: 'session-test',
        workspaceRootPath: '/tmp/craft-agent-test',
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      } as any,
      isHeadless: true,
    }

    const agent = new PiAgent(config)
    expect(agent.supportsBranching).toBe(false)
    agent.destroy()
  })
})
