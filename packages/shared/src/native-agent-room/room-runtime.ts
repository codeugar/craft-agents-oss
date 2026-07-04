import { loadRoom, saveRoom } from './storage.ts';
import { isRequestAction, publishRoomBusEvent } from './room-bus.ts';
import { resolveContextPack } from './attention.ts';
import type {
  ContextPack,
  RoomBusActionType,
  RoomBusEvent,
  TargetRef,
} from './types.ts';

export interface AgentTurnPrompt {
  systemPrompt: string;
  userPrompt: string;
}

export interface AgentTurnAction {
  type: RoomBusActionType;
  to?: TargetRef[];
  taskId?: string;
  artifactId?: string;
  decisionId?: string;
  payload: Record<string, unknown>;
  parentEventId?: string;
}

export interface AgentTurnInput {
  contextPack: ContextPack;
  prompt: AgentTurnPrompt;
  allowedActions: RoomBusActionType[];
}

export interface AgentTurnOutput {
  actions: AgentTurnAction[];
}

export type AgentRunner = (input: AgentTurnInput) => AgentTurnOutput | Promise<AgentTurnOutput>;

export interface RejectedAction {
  action: AgentTurnAction;
  reason: string;
}

export interface RunAgentTurnInput {
  roomId: string;
  agentId: string;
  runner: AgentRunner;
  triggerEventId?: string;
}

export interface RunAgentTurnResult {
  roomId: string;
  agentId: string;
  publishedEvents: RoomBusEvent[];
  rejectedActions: RejectedAction[];
  handledInboxItemIds: string[];
  contextPack: ContextPack;
}

export interface RoomSchedulerInput {
  roomId: string;
  /** agentId (room member id) -> runner executing that agent's turns. */
  runners: Record<string, AgentRunner>;
  /** Hard cap on total turns per scheduler run. Defaults to 20. */
  maxTurns?: number;
}

export interface RoomSchedulerResult {
  turns: RunAgentTurnResult[];
  stoppedReason: 'quiescent' | 'max_turns' | 'room_paused';
}

function payloadMessage(event: RoomBusEvent): string {
  return typeof event.payload.message === 'string' ? event.payload.message : '';
}

function section(title: string, lines: string[]): string[] {
  if (lines.length === 0) return [];
  return [`## ${title}`, ...lines, ''];
}

export function buildAgentTurnPrompt(pack: ContextPack): AgentTurnPrompt {
  const role = pack.roleContext;

  const systemLines = [
    role.prompt,
    '',
    '## Role Contract',
    `- Role: ${role.name} (${role.roleKey})`,
    `- Mission: ${role.mission}`,
    ...role.responsibilities.map((item) => `- Responsibility: ${item}`),
    ...role.doneCriteria.map((item) => `- Done criteria: ${item}`),
    ...(role.forbiddenActions.length > 0
      ? [`- Forbidden actions: ${role.forbiddenActions.join(', ')}`]
      : []),
  ];

  const userLines = [
    ...section('Room Members', pack.memberDirectory.map((member) =>
      `- ${member.name} (${member.roleKey}) — status: ${member.status}${
        member.responsibilities.length > 0 ? `; responsibilities: ${member.responsibilities.join('; ')}` : ''
      }`
    )),
    ...section('Current Task', pack.currentTask
      ? [
          `- ${pack.currentTask.title} (status: ${pack.currentTask.status}, phase: ${pack.currentTask.phase})`,
          ...(pack.currentTask.description ? [`  ${pack.currentTask.description}`] : []),
          ...pack.currentTask.doneCriteria.map((item) => `  - Done when: ${item}`),
        ]
      : []),
    ...section('Required Artifacts', pack.requiredArtifacts.map((artifact) =>
      `- ${artifact.name}@v${artifact.version} (${artifact.type}, ${artifact.status})`
    )),
    ...section('Relevant Decisions', pack.relevantDecisions.map((decision) =>
      `- ${decision.title} (${decision.status})`
    )),
    ...section('Attention Events', pack.attentionEvents.map((event) => {
      const message = payloadMessage(event);
      return `- [${event.type}] from ${event.from} (${event.status})${message ? `: ${message}` : ''}`;
    })),
    ...section('Unread Inbox', pack.inboxItems
      .filter((item) => item.status === 'unread')
      .map((item) => `- [${item.type}] priority: ${item.priority} (event: ${item.eventId})`)),
    ...section('Room Timeline', pack.timeline.map((item) => `- ${item.title}`)),
    ...section('Your Available Actions', [
      `You may take these RoomBus actions: ${role.allowedActions.join(', ')}.`,
      'If you are missing required context or artifacts, do not guess — ask the responsible agent via ask_agent or raise a blocker.',
    ]),
  ];

  return {
    systemPrompt: systemLines.join('\n'),
    userPrompt: userLines.join('\n'),
  };
}

export async function runAgentTurn(
  workspaceRootPath: string,
  input: RunAgentTurnInput
): Promise<RunAgentTurnResult> {
  const room = loadRoom(workspaceRootPath, input.roomId);
  if (!room) {
    throw new Error(`Room not found: ${input.roomId}`);
  }
  if (room.status === 'paused') {
    throw new Error(`Room is paused: ${room.id}`);
  }

  const member = room.members.find((item) => item.id === input.agentId);
  if (!member) {
    throw new Error(`Agent not found in room: ${input.agentId}`);
  }

  const contextPack = resolveContextPack(workspaceRootPath, {
    roomId: input.roomId,
    agentId: input.agentId,
    triggerEventId: input.triggerEventId,
  });
  const prompt = buildAgentTurnPrompt(contextPack);
  const unreadItemIds = contextPack.inboxItems
    .filter((item) => item.status === 'unread')
    .map((item) => item.id);

  const output = await input.runner({
    contextPack,
    prompt,
    allowedActions: contextPack.roleContext.allowedActions,
  });

  const maxRequests = room.roomBusPolicy?.maxRequestsPerAgentTurn ?? 3;
  const publishedEvents: RoomBusEvent[] = [];
  const rejectedActions: RejectedAction[] = [];
  let requestCount = 0;

  for (const action of output.actions) {
    if (!contextPack.roleContext.allowedActions.includes(action.type)) {
      rejectedActions.push({
        action,
        reason: `Action ${action.type} is not allowed for role ${contextPack.roleContext.roleKey}`,
      });
      continue;
    }

    if (isRequestAction(action.type) && requestCount >= maxRequests) {
      rejectedActions.push({
        action,
        reason: `Per-turn request cap reached (${maxRequests})`,
      });
      continue;
    }

    try {
      const event = publishRoomBusEvent(workspaceRootPath, {
        roomId: input.roomId,
        from: input.agentId,
        to: action.to,
        type: action.type,
        taskId: action.taskId,
        artifactId: action.artifactId,
        decisionId: action.decisionId,
        payload: action.payload,
        parentEventId: action.parentEventId,
      });
      publishedEvents.push(event);
      if (isRequestAction(action.type)) {
        requestCount += 1;
      }
    } catch (error) {
      rejectedActions.push({
        action,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (unreadItemIds.length > 0) {
    const latest = loadRoom(workspaceRootPath, input.roomId)!;
    const inbox = latest.inboxes.find((item) => item.agentId === input.agentId);
    if (inbox) {
      const unread = new Set(unreadItemIds);
      for (const item of inbox.items) {
        if (unread.has(item.id)) {
          item.status = 'handled';
        }
      }
      saveRoom(workspaceRootPath, latest);
    }
  }

  return {
    roomId: input.roomId,
    agentId: input.agentId,
    publishedEvents,
    rejectedActions,
    handledInboxItemIds: unreadItemIds,
    contextPack,
  };
}

function nextAgentWithAttention(
  workspaceRootPath: string,
  roomId: string,
  runners: Record<string, AgentRunner>
): { agentId: string; triggerEventId?: string } | null | 'paused' {
  const room = loadRoom(workspaceRootPath, roomId);
  if (!room) {
    throw new Error(`Room not found: ${roomId}`);
  }
  if (room.status === 'paused') return 'paused';

  for (const member of room.members) {
    if (!runners[member.id]) continue;
    const inbox = room.inboxes.find((item) => item.agentId === member.id);
    const unread = inbox?.items.find((item) => item.status === 'unread');
    if (unread) {
      return { agentId: member.id, triggerEventId: unread.eventId };
    }
  }
  return null;
}

export async function runRoomScheduler(
  workspaceRootPath: string,
  input: RoomSchedulerInput
): Promise<RoomSchedulerResult> {
  const maxTurns = input.maxTurns ?? 20;
  const turns: RunAgentTurnResult[] = [];

  while (turns.length < maxTurns) {
    const next = nextAgentWithAttention(workspaceRootPath, input.roomId, input.runners);
    if (next === 'paused') {
      return { turns, stoppedReason: 'room_paused' };
    }
    if (next === null) {
      return { turns, stoppedReason: 'quiescent' };
    }

    const turn = await runAgentTurn(workspaceRootPath, {
      roomId: input.roomId,
      agentId: next.agentId,
      runner: input.runners[next.agentId]!,
      triggerEventId: next.triggerEventId,
    });
    turns.push(turn);
  }

  return { turns, stoppedReason: 'max_turns' };
}
