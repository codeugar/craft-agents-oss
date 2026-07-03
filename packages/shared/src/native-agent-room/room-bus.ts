import { createNativeAgentRoomId, loadRoom, saveRoom } from './storage.ts';
import { resolveEventAttentionAgentIds, resolveMentionTargets } from './attention.ts';
import type {
  AgentInbox,
  InboxItem,
  InboxItemPriority,
  InboxItemType,
  Room,
  RoomBusActionType,
  RoomBusEvent,
  TargetRef,
} from './types.ts';

export interface PublishRoomBusEventInput {
  roomId: string;
  from: RoomBusEvent['from'];
  to?: TargetRef[];
  type: RoomBusActionType;
  taskId?: string;
  artifactId?: string;
  decisionId?: string;
  payload: Record<string, unknown>;
  parentEventId?: string;
  ttlMs?: number;
  maxHops?: number;
}

const ROOM_BUS_ACTIONS = new Set<RoomBusActionType>([
  'message',
  'ask_agent',
  'answer_agent',
  'raise_blocker',
  'resolve_blocker',
  'handoff_task',
  'request_review',
  'review_result',
  'propose_change',
  'artifact_update',
  'decision',
  'approval_request',
  'announcement',
]);

const REQUEST_ACTIONS = new Set<RoomBusActionType>([
  'ask_agent',
  'handoff_task',
  'request_review',
  'approval_request',
]);

function eventTargetKey(targets: TargetRef[] | undefined): string {
  return (targets ?? [])
    .map((target) => {
      if (target.type === 'role') return `role:${target.roleKey}`;
      if (target.type === 'all') return 'all';
      return `${target.type}:${target.id}`;
    })
    .sort()
    .join('|');
}

function assertExpectedOutput(input: PublishRoomBusEventInput): void {
  if (!REQUEST_ACTIONS.has(input.type)) return;

  const expectedOutput = input.payload.expectedOutput;
  if (typeof expectedOutput !== 'string' || expectedOutput.trim().length === 0) {
    throw new Error(`${input.type} requires payload.expectedOutput`);
  }
}

function assertKnownEventType(type: RoomBusActionType): void {
  if (!ROOM_BUS_ACTIONS.has(type)) {
    throw new Error(`Unsupported RoomBus event type: ${type}`);
  }
}

function resolveTarget(room: Room, target: TargetRef): string[] {
  if (target.type === 'all') {
    return room.members.map((member) => member.id);
  }

  if (target.type === 'agent') {
    if (!room.members.some((member) => member.id === target.id)) {
      throw new Error(`RoomBus target agent not found: ${target.id}`);
    }
    return [target.id];
  }

  if (target.type === 'role') {
    const members = room.members.filter((member) => member.roleKey === target.roleKey);
    if (members.length === 0) {
      throw new Error(`RoomBus target role not found: ${target.roleKey}`);
    }
    return members.map((member) => member.id);
  }

  if (target.type === 'task') {
    const task = room.tasks.find((item) => item.id === target.id);
    if (!task) {
      throw new Error(`RoomBus target task not found: ${target.id}`);
    }
    return [task.ownerAgentId];
  }

  const artifact = room.artifacts.find((item) => item.id === target.id);
  if (!artifact) {
    throw new Error(`RoomBus target artifact not found: ${target.id}`);
  }

  const agentIds = new Set<string>();
  if (artifact.ownerAgentId) {
    agentIds.add(artifact.ownerAgentId);
  }
  for (const task of room.tasks) {
    if (task.inputArtifactIds.includes(artifact.id)) {
      agentIds.add(task.ownerAgentId);
    }
  }
  return [...agentIds];
}

export function resolveRoomBusTargets(room: Room, targets: TargetRef[] | undefined): string[] {
  if (!targets || targets.length === 0) return [];

  const agentIds = new Set<string>();
  for (const target of targets) {
    for (const agentId of resolveTarget(room, target)) {
      agentIds.add(agentId);
    }
  }
  return [...agentIds];
}

function getParentChain(room: Room, parentEventId: string | undefined): RoomBusEvent[] {
  const chain: RoomBusEvent[] = [];
  let currentId = parentEventId;
  const seen = new Set<string>();

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const event = room.events.find((item) => item.id === currentId);
    if (!event) break;
    chain.push(event);
    currentId = event.parentEventId;
  }

  return chain;
}

function assertLoopSafety(room: Room, input: PublishRoomBusEventInput, maxHops: number): number {
  const chain = getParentChain(room, input.parentEventId);
  const hopCount = chain.length > 0 ? (chain[0]!.hopCount ?? 0) + 1 : 0;
  if (hopCount > maxHops) {
    throw new Error(`RoomBus max hops exceeded: ${hopCount}/${maxHops}`);
  }

  const signature = `${input.type}:${input.from}:${eventTargetKey(input.to)}`;
  if (chain.some((event) => `${event.type}:${event.from}:${eventTargetKey(event.to)}` === signature)) {
    throw new Error('RoomBus loop detected');
  }

  return hopCount;
}

function inboxTypeForEvent(type: RoomBusActionType): InboxItemType {
  if (type === 'request_review' || type === 'review_result') return 'review_request';
  if (type === 'raise_blocker' || type === 'resolve_blocker') return 'blocker';
  if (type === 'handoff_task') return 'handoff';
  if (type === 'artifact_update') return 'artifact_update';
  if (type === 'decision') return 'decision_update';
  if (type === 'announcement') return 'announcement';
  return 'request';
}

function priorityForEvent(event: RoomBusEvent): InboxItemPriority {
  if (event.type === 'raise_blocker') return 'blocking';
  if (event.type === 'review_result' && event.payload.severity === 'blocking') return 'blocking';
  if (event.type === 'request_review' || event.type === 'handoff_task') return 'high';
  if (event.type === 'announcement') return 'low';
  return 'normal';
}

function ensureInbox(room: Room, agentId: string): AgentInbox {
  const existing = room.inboxes.find((inbox) => inbox.agentId === agentId);
  if (existing) return existing;

  const member = room.members.find((item) => item.id === agentId);
  if (!member) {
    throw new Error(`Agent inbox owner not found: ${agentId}`);
  }

  const inbox: AgentInbox = {
    id: member.inboxId,
    roomId: room.id,
    agentId,
    items: [],
  };
  room.inboxes.push(inbox);
  return inbox;
}

function addInboxItem(room: Room, agentId: string, event: RoomBusEvent): void {
  const inbox = ensureInbox(room, agentId);
  if (inbox.items.some((item) => item.eventId === event.id)) return;

  const item: InboxItem = {
    id: createNativeAgentRoomId('inbox_item'),
    eventId: event.id,
    type: inboxTypeForEvent(event.type),
    status: 'unread',
    priority: priorityForEvent(event),
    createdAt: event.createdAt,
  };
  inbox.items.push(item);
}

function updateTaskStatusFromEvent(room: Room, event: RoomBusEvent): void {
  if (!event.taskId) return;
  const task = room.tasks.find((item) => item.id === event.taskId);
  if (!task) return;

  if (event.type === 'raise_blocker') {
    task.status = 'blocked';
  } else if (event.type === 'request_review') {
    task.status = 'waiting_review';
  } else if (event.type === 'review_result' && event.payload.severity === 'blocking') {
    task.status = 'changes_requested';
  } else {
    return;
  }

  task.updatedAt = event.createdAt;
}

function resolveParentIfNeeded(room: Room, event: RoomBusEvent): void {
  if (!event.parentEventId) return;
  if (!['answer_agent', 'resolve_blocker', 'review_result'].includes(event.type)) return;

  const parent = room.events.find((item) => item.id === event.parentEventId);
  if (!parent || parent.status !== 'open') return;

  parent.status = 'resolved';
  parent.resolvedAt = event.createdAt;
}

export function publishRoomBusEvent(
  workspaceRootPath: string,
  input: PublishRoomBusEventInput
): RoomBusEvent {
  const room = loadRoom(workspaceRootPath, input.roomId);
  if (!room) {
    throw new Error(`Room not found: ${input.roomId}`);
  }

  assertKnownEventType(input.type);
  assertExpectedOutput(input);

  const mentionTargets = input.to && input.to.length > 0
    ? []
    : resolveMentionTargets(room, typeof input.payload.message === 'string' ? input.payload.message : '');
  const eventTargets = input.to ?? (mentionTargets.length > 0 ? mentionTargets : undefined);
  const maxHops = input.maxHops ?? room.roomBusPolicy?.maxHops ?? 4;
  const hopCount = assertLoopSafety(room, { ...input, to: eventTargets }, maxHops);
  const targetAgentIds = resolveEventAttentionAgentIds(room, {
    ...input,
    to: eventTargets,
    status: 'open',
  });

  if (input.type !== 'announcement' && targetAgentIds.length === 0) {
    throw new Error('RoomBus event requires at least one resolvable target');
  }

  const now = Date.now();
  const ttlMs = input.ttlMs ?? room.roomBusPolicy?.defaultTtlMs ?? 24 * 60 * 60 * 1000;
  const event: RoomBusEvent = {
    id: createNativeAgentRoomId('event'),
    projectId: room.projectId,
    roomId: room.id,
    from: input.from,
    to: eventTargets,
    type: input.type,
    taskId: input.taskId,
    artifactId: input.artifactId,
    decisionId: input.decisionId,
    payload: input.payload,
    status: 'open',
    createdAt: now,
    parentEventId: input.parentEventId,
    expiresAt: now + ttlMs,
    hopCount,
    maxHops,
  };

  room.events.push(event);
  updateTaskStatusFromEvent(room, event);
  resolveParentIfNeeded(room, event);

  const inboxTargetIds = event.type === 'announcement'
    ? room.members.map((member) => member.id)
    : targetAgentIds;

  for (const agentId of inboxTargetIds) {
    addInboxItem(room, agentId, event);
  }

  if (REQUEST_ACTIONS.has(event.type) && room.members.some((member) => member.id === event.from)) {
    addInboxItem(room, event.from, event);
  }

  saveRoom(workspaceRootPath, room);
  return event;
}
