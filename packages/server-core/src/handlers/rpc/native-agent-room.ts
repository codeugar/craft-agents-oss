import { RPC_CHANNELS } from '@craft-agent/shared/protocol'
import { getWorkspaceByNameOrId } from '@craft-agent/shared/config'
import type { RpcServer } from '@craft-agent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'
import type {
  CreateAgentDefinitionInput,
  RoomLlmQuery,
  RoomStatus,
  UpdateAgentDefinitionInput,
} from '@craft-agent/shared/native-agent-room'

export const HANDLED_CHANNELS = [
  RPC_CHANNELS.nativeAgentRoom.AGENTS_LIST,
  RPC_CHANNELS.nativeAgentRoom.AGENTS_CREATE,
  RPC_CHANNELS.nativeAgentRoom.AGENTS_UPDATE,
  RPC_CHANNELS.nativeAgentRoom.AGENTS_DELETE,
  RPC_CHANNELS.nativeAgentRoom.ROOMS_LIST,
  RPC_CHANNELS.nativeAgentRoom.ROOMS_GET,
  RPC_CHANNELS.nativeAgentRoom.ROOMS_CREATE,
  RPC_CHANNELS.nativeAgentRoom.ROOMS_SET_STATUS,
  RPC_CHANNELS.nativeAgentRoom.ROOMS_POST_MESSAGE,
  RPC_CHANNELS.nativeAgentRoom.ROOMS_RUN,
] as const

function requireWorkspace(workspaceId: string) {
  const workspace = getWorkspaceByNameOrId(workspaceId)
  if (!workspace) throw new Error('Workspace not found')
  return workspace
}

export interface CreateRoomRpcInput {
  name: string
  goal: string
  agentDefinitionIds: string[]
  projectId?: string
}

export interface RunRoomRpcResult {
  /** False when the room already had a run in flight. */
  started: boolean
}

// Rooms with an in-flight scheduler run (per server process). Long runs are
// fire-and-forget: clients poll ROOMS_GET and watch `isRunning`.
const runningRooms = new Set<string>()

export function registerNativeAgentRoomHandlers(server: RpcServer, deps: HandlerDeps): void {
  // --- Agent library ---

  server.handle(RPC_CHANNELS.nativeAgentRoom.AGENTS_LIST, async (_ctx, workspaceId: string) => {
    const { listAgentDefinitions } = await import('@craft-agent/shared/native-agent-room')
    return listAgentDefinitions(requireWorkspace(workspaceId).rootPath)
  })

  server.handle(
    RPC_CHANNELS.nativeAgentRoom.AGENTS_CREATE,
    async (_ctx, workspaceId: string, input: CreateAgentDefinitionInput) => {
      const { createAgentDefinition } = await import('@craft-agent/shared/native-agent-room')
      return createAgentDefinition(requireWorkspace(workspaceId).rootPath, input)
    },
  )

  server.handle(
    RPC_CHANNELS.nativeAgentRoom.AGENTS_UPDATE,
    async (_ctx, workspaceId: string, agentDefinitionId: string, patch: UpdateAgentDefinitionInput) => {
      const { updateAgentDefinition } = await import('@craft-agent/shared/native-agent-room')
      return updateAgentDefinition(requireWorkspace(workspaceId).rootPath, agentDefinitionId, patch)
    },
  )

  server.handle(
    RPC_CHANNELS.nativeAgentRoom.AGENTS_DELETE,
    async (_ctx, workspaceId: string, agentDefinitionId: string) => {
      const { deleteAgentDefinition } = await import('@craft-agent/shared/native-agent-room')
      deleteAgentDefinition(requireWorkspace(workspaceId).rootPath, agentDefinitionId)
    },
  )

  // --- Rooms ---

  server.handle(RPC_CHANNELS.nativeAgentRoom.ROOMS_LIST, async (_ctx, workspaceId: string) => {
    const { listRooms } = await import('@craft-agent/shared/native-agent-room')
    return listRooms(requireWorkspace(workspaceId).rootPath)
  })

  server.handle(RPC_CHANNELS.nativeAgentRoom.ROOMS_GET, async (_ctx, workspaceId: string, roomId: string) => {
    const nar = await import('@craft-agent/shared/native-agent-room')
    const rootPath = requireWorkspace(workspaceId).rootPath
    const room = nar.loadRoom(rootPath, roomId)
    if (!room) throw new Error(`Room not found: ${roomId}`)
    const project = nar.loadProject(rootPath, room.projectId)
    return { room, project, isRunning: runningRooms.has(roomId) }
  })

  server.handle(
    RPC_CHANNELS.nativeAgentRoom.ROOMS_CREATE,
    async (_ctx, workspaceId: string, input: CreateRoomRpcInput) => {
      const nar = await import('@craft-agent/shared/native-agent-room')
      const rootPath = requireWorkspace(workspaceId).rootPath

      let projectId = input.projectId
      if (!projectId) {
        const projects = nar.listProjects(rootPath)
        projectId = projects[0]?.id ?? nar.createProject(rootPath, { name: 'Agent Rooms' }).id
      }

      return nar.createRoomWithAgents(rootPath, {
        projectId,
        name: input.name,
        goal: input.goal,
        agentDefinitionIds: input.agentDefinitionIds,
        status: 'active',
      })
    },
  )

  server.handle(
    RPC_CHANNELS.nativeAgentRoom.ROOMS_SET_STATUS,
    async (_ctx, workspaceId: string, roomId: string, status: RoomStatus) => {
      const nar = await import('@craft-agent/shared/native-agent-room')
      const rootPath = requireWorkspace(workspaceId).rootPath
      const room = nar.loadRoom(rootPath, roomId)
      if (!room) throw new Error(`Room not found: ${roomId}`)
      room.status = status
      nar.saveRoom(rootPath, room)
      return nar.loadRoom(rootPath, roomId)
    },
  )

  server.handle(
    RPC_CHANNELS.nativeAgentRoom.ROOMS_POST_MESSAGE,
    async (_ctx, workspaceId: string, roomId: string, message: string) => {
      const nar = await import('@craft-agent/shared/native-agent-room')
      const rootPath = requireWorkspace(workspaceId).rootPath
      const room = nar.loadRoom(rootPath, roomId)
      if (!room) throw new Error(`Room not found: ${roomId}`)

      // Plain messages without an @mention address the whole room.
      const mentionTargets = nar.resolveMentionTargets(room, message)
      const event = nar.publishRoomBusEvent(rootPath, {
        roomId,
        from: 'user',
        to: mentionTargets.length > 0 ? undefined : [{ type: 'all' }],
        type: 'message',
        payload: { message },
      })
      nar.refreshRoomTimeline(rootPath, roomId)
      return event
    },
  )

  server.handle(
    RPC_CHANNELS.nativeAgentRoom.ROOMS_RUN,
    async (_ctx, workspaceId: string, roomId: string): Promise<RunRoomRpcResult> => {
      const nar = await import('@craft-agent/shared/native-agent-room')
      const { getDefaultLlmConnection, getLlmConnection } = await import('@craft-agent/shared/config')
      const { createBackendFromConnection } = await import('@craft-agent/shared/agent/backend')

      const workspace = requireWorkspace(workspaceId)
      const room = nar.loadRoom(workspace.rootPath, roomId)
      if (!room) throw new Error(`Room not found: ${roomId}`)

      if (runningRooms.has(roomId)) {
        return { started: false }
      }

      const connectionSlug = getDefaultLlmConnection()
      if (!connectionSlug) {
        throw new Error('No LLM connection configured. Set up a connection in Settings first.')
      }
      const connection = getLlmConnection(connectionSlug)

      const now = Date.now()
      const agent = createBackendFromConnection(connectionSlug, {
        workspace,
        session: {
          id: `native-agent-room-${roomId}-${now}`,
          workspaceRootPath: workspace.rootPath,
          llmConnection: connectionSlug,
          createdAt: now,
          lastUsedAt: now,
        },
        isHeadless: true,
      }, {
        // Pi backends spawn a subprocess and need the host runtime paths
        // (piServerPath is resolved from these), mirroring SessionManager.
        appRootPath: deps.platform.appRootPath,
        resourcesPath: deps.platform.resourcesPath,
        isPackaged: deps.platform.isPackaged,
      })
      runningRooms.add(roomId)

      // Fire and forget: multi-turn LLM runs exceed the RPC timeout, so the
      // scheduler runs detached and clients poll ROOMS_GET / isRunning.
      void (async () => {
        try {
          await agent.postInit()
          // queryLlm lives on BaseAgent (not the AgentBackend interface); every
          // concrete backend implements it. RoomLlmQuery is structurally compatible.
          const queryLlm: RoomLlmQuery = (request) =>
            (agent as unknown as { queryLlm: RoomLlmQuery }).queryLlm(request)
          const runner = nar.createLlmAgentRunner({
            queryLlm,
            model: connection?.defaultModel,
          })
          const runners = Object.fromEntries(room.members.map((member) => [member.id, runner]))

          await nar.runRoomScheduler(workspace.rootPath, {
            roomId,
            runners,
            maxTurns: 12,
          })
          nar.refreshRoomTimeline(workspace.rootPath, roomId)
        } catch (error) {
          console.error(`[native-agent-room] Room run failed for ${roomId}:`, error)
        } finally {
          runningRooms.delete(roomId)
          agent.destroy()
        }
      })()

      return { started: true }
    },
  )
}
