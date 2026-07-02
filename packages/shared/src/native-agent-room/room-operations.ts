import { loadRoom, loadTeamTemplate, saveRoom, createRoomRecord, createTeamTemplate, createNativeAgentRoomId } from './storage.ts';
import type {
  AgentInbox,
  CreateTeamTemplateInput,
  InboxItem,
  RoleCard,
  Room,
  RoomBusActionType,
  RoomBusPolicy,
  RoomMember,
  TargetRef,
  TeamTemplate,
  TimelineItem,
  WorkflowTemplate,
} from './types.ts';

export interface CreateRoomFromTemplateInput {
  projectId: string;
  templateId: string;
  name: string;
  goal: string;
}

export interface DuplicateRoomConfigInput {
  sourceRoomId: string;
  name: string;
  goal?: string;
  projectId?: string;
}

export interface ForkRoomInput {
  sourceRoomId: string;
  name: string;
  goal?: string;
}

export interface SaveRoomAsTeamTemplateInput {
  roomId: string;
  name: string;
  description?: string;
}

const DEFAULT_PHASES: WorkflowTemplate['phases'] = [
  'clarify',
  'plan',
  'foundation',
  'design',
  'implementation',
  'review',
  'fix',
  'deliver',
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createMemberForRole(roomId: string, role: RoleCard): RoomMember {
  const memberId = createNativeAgentRoomId('agent');
  return {
    id: memberId,
    roomId,
    roleCardId: role.id,
    name: role.name,
    roleKey: role.roleKey,
    sessionId: createNativeAgentRoomId('session'),
    inboxId: createNativeAgentRoomId('inbox'),
    status: 'idle',
    ownedTaskIds: [],
    ownedArtifactIds: [],
  };
}

function createInboxForMember(roomId: string, member: RoomMember): AgentInbox {
  return {
    id: member.inboxId,
    roomId,
    agentId: member.id,
    items: [],
  };
}

function createMembersAndInboxes(roomId: string, roles: RoleCard[]): {
  members: RoomMember[];
  inboxes: AgentInbox[];
} {
  const members = roles.map((role) => createMemberForRole(roomId, role));
  return {
    members,
    inboxes: members.map((member) => createInboxForMember(roomId, member)),
  };
}

function defaultWorkflow(): WorkflowTemplate {
  return {
    phases: [...DEFAULT_PHASES],
    steps: [],
  };
}

function defaultRoomBusPolicy(roles: RoleCard[]): RoomBusPolicy {
  const allowedActions = new Set<RoomBusActionType>();
  for (const role of roles) {
    for (const action of role.allowedActions) {
      allowedActions.add(action);
    }
  }

  return {
    allowedActions: allowedActions.size > 0
      ? [...allowedActions]
      : ['ask_agent', 'answer_agent', 'request_review', 'review_result', 'artifact_update', 'announcement'],
    maxRequestsPerAgentTurn: 3,
    defaultTtlMs: 24 * 60 * 60 * 1000,
    maxHops: 4,
  };
}

export function createRoomFromTemplate(
  workspaceRootPath: string,
  input: CreateRoomFromTemplateInput
): Room {
  const template = loadTeamTemplate(workspaceRootPath, input.templateId);
  if (!template) {
    throw new Error(`Team template not found: ${input.templateId}`);
  }

  const roleCards = clone(template.roles);
  const room = createRoomRecord(workspaceRootPath, {
    projectId: input.projectId,
    templateId: template.id,
    name: input.name,
    goal: input.goal,
    workflow: clone(template.defaultWorkflow),
    roomBusPolicy: clone(template.roomBusPolicy),
    roleCards,
  });

  const { members, inboxes } = createMembersAndInboxes(room.id, roleCards);
  const nextRoom: Room = {
    ...room,
    members,
    inboxes,
  };
  saveRoom(workspaceRootPath, nextRoom);
  return nextRoom;
}

export function duplicateRoomConfig(
  workspaceRootPath: string,
  input: DuplicateRoomConfigInput
): Room {
  const source = loadRoom(workspaceRootPath, input.sourceRoomId);
  if (!source) {
    throw new Error(`Room not found: ${input.sourceRoomId}`);
  }

  const roleCards = clone(source.roleCards);
  const room = createRoomRecord(workspaceRootPath, {
    projectId: input.projectId ?? source.projectId,
    templateId: source.templateId,
    name: input.name,
    goal: input.goal ?? source.goal,
    status: 'draft',
    phase: source.phase,
    workflow: clone(source.workflow ?? defaultWorkflow()),
    roomBusPolicy: clone(source.roomBusPolicy ?? defaultRoomBusPolicy(roleCards)),
    roleCards,
  });

  const { members, inboxes } = createMembersAndInboxes(room.id, roleCards);
  const nextRoom: Room = {
    ...room,
    members,
    inboxes,
  };
  saveRoom(workspaceRootPath, nextRoom);
  return nextRoom;
}

function remapTarget(target: TargetRef, maps: {
  memberIds: Map<string, string>;
  taskIds: Map<string, string>;
  artifactIds: Map<string, string>;
}): TargetRef {
  if (target.type === 'agent') {
    return { type: 'agent', id: maps.memberIds.get(target.id) ?? target.id };
  }
  if (target.type === 'task') {
    return { type: 'task', id: maps.taskIds.get(target.id) ?? target.id };
  }
  if (target.type === 'artifact') {
    return { type: 'artifact', id: maps.artifactIds.get(target.id) ?? target.id };
  }
  return target;
}

export function forkRoom(workspaceRootPath: string, input: ForkRoomInput): Room {
  const source = loadRoom(workspaceRootPath, input.sourceRoomId);
  if (!source) {
    throw new Error(`Room not found: ${input.sourceRoomId}`);
  }

  const baseRoom = createRoomRecord(workspaceRootPath, {
    projectId: source.projectId,
    templateId: source.templateId,
    name: input.name,
    goal: input.goal ?? source.goal,
  });

  const memberIds = new Map(source.members.map((member) => [member.id, createNativeAgentRoomId('agent')]));
  const inboxIds = new Map(source.inboxes.map((inbox) => [inbox.id, createNativeAgentRoomId('inbox')]));
  const taskIds = new Map(source.tasks.map((task) => [task.id, createNativeAgentRoomId('task')]));
  const artifactIds = new Map(source.artifacts.map((artifact) => [artifact.id, createNativeAgentRoomId('artifact')]));
  const decisionIds = new Map(source.decisions.map((decision) => [decision.id, createNativeAgentRoomId('decision')]));
  const eventIds = new Map(source.events.map((event) => [event.id, createNativeAgentRoomId('event')]));
  const timelineIds = new Map(source.timeline.map((item) => [item.id, createNativeAgentRoomId('timeline')]));
  const inboxItemIds = new Map<string, string>();

  for (const inbox of source.inboxes) {
    for (const item of inbox.items) {
      inboxItemIds.set(item.id, createNativeAgentRoomId('inbox_item'));
    }
  }

  const members = source.members.map((member) => ({
    ...clone(member),
    id: memberIds.get(member.id)!,
    roomId: baseRoom.id,
    sessionId: createNativeAgentRoomId('session'),
    inboxId: inboxIds.get(member.inboxId) ?? createNativeAgentRoomId('inbox'),
    ownedTaskIds: member.ownedTaskIds.map((id) => taskIds.get(id) ?? id),
    ownedArtifactIds: member.ownedArtifactIds.map((id) => artifactIds.get(id) ?? id),
  }));

  const tasks = source.tasks.map((task) => ({
    ...clone(task),
    id: taskIds.get(task.id)!,
    roomId: baseRoom.id,
    ownerAgentId: memberIds.get(task.ownerAgentId) ?? task.ownerAgentId,
    inputArtifactIds: task.inputArtifactIds.map((id) => artifactIds.get(id) ?? id),
    outputArtifactIds: task.outputArtifactIds.map((id) => artifactIds.get(id) ?? id),
    dependencyTaskIds: task.dependencyTaskIds.map((id) => taskIds.get(id) ?? id),
  }));

  const artifacts = source.artifacts.map((artifact) => ({
    ...clone(artifact),
    id: artifactIds.get(artifact.id)!,
    roomId: baseRoom.id,
    taskId: artifact.taskId ? taskIds.get(artifact.taskId) ?? artifact.taskId : undefined,
    ownerAgentId: artifact.ownerAgentId ? memberIds.get(artifact.ownerAgentId) ?? artifact.ownerAgentId : undefined,
  }));

  const decisions = source.decisions.map((decision) => ({
    ...clone(decision),
    id: decisionIds.get(decision.id)!,
    roomId: baseRoom.id,
    relatedTaskIds: decision.relatedTaskIds.map((id) => taskIds.get(id) ?? id),
    relatedArtifactIds: decision.relatedArtifactIds.map((id) => artifactIds.get(id) ?? id),
    createdBy: memberIds.get(decision.createdBy) ?? decision.createdBy,
    approvedBy: decision.approvedBy && decision.approvedBy !== 'user'
      ? memberIds.get(decision.approvedBy) ?? decision.approvedBy
      : decision.approvedBy,
  }));

  const maps = { memberIds, taskIds, artifactIds };
  const events = source.events.map((event) => ({
    ...clone(event),
    id: eventIds.get(event.id)!,
    roomId: baseRoom.id,
    from: memberIds.get(event.from) ?? event.from,
    to: event.to?.map((target) => remapTarget(target, maps)),
    taskId: event.taskId ? taskIds.get(event.taskId) ?? event.taskId : undefined,
    artifactId: event.artifactId ? artifactIds.get(event.artifactId) ?? event.artifactId : undefined,
    decisionId: event.decisionId ? decisionIds.get(event.decisionId) ?? event.decisionId : undefined,
    parentEventId: event.parentEventId ? eventIds.get(event.parentEventId) ?? event.parentEventId : undefined,
  }));

  const inboxes = source.inboxes.map((inbox) => ({
    ...clone(inbox),
    id: inboxIds.get(inbox.id)!,
    roomId: baseRoom.id,
    agentId: memberIds.get(inbox.agentId) ?? inbox.agentId,
    items: inbox.items.map((item): InboxItem => ({
      ...clone(item),
      id: inboxItemIds.get(item.id)!,
      eventId: eventIds.get(item.eventId) ?? item.eventId,
    })),
  }));

  const timeline = source.timeline.map((item): TimelineItem => ({
    ...clone(item),
    id: timelineIds.get(item.id)!,
    roomId: baseRoom.id,
    sourceEventIds: item.sourceEventIds.map((id) => eventIds.get(id) ?? id),
    sourceArtifactIds: item.sourceArtifactIds.map((id) => artifactIds.get(id) ?? id),
    sourceDecisionIds: item.sourceDecisionIds.map((id) => decisionIds.get(id) ?? id),
  }));

  const forked: Room = {
    ...baseRoom,
    forkedFromRoomId: source.id,
    status: source.status,
    phase: source.phase,
    workflow: clone(source.workflow ?? defaultWorkflow()),
    roomBusPolicy: clone(source.roomBusPolicy ?? defaultRoomBusPolicy(source.roleCards)),
    roleCards: clone(source.roleCards),
    members,
    tasks,
    artifacts,
    decisions,
    events,
    inboxes,
    timeline,
  };

  saveRoom(workspaceRootPath, forked);
  return forked;
}

export function saveRoomAsTeamTemplate(
  workspaceRootPath: string,
  input: SaveRoomAsTeamTemplateInput
): TeamTemplate {
  const room = loadRoom(workspaceRootPath, input.roomId);
  if (!room) {
    throw new Error(`Room not found: ${input.roomId}`);
  }

  const templateInput: CreateTeamTemplateInput = {
    projectId: room.projectId,
    name: input.name,
    description: input.description,
    roles: clone(room.roleCards),
    defaultWorkflow: clone(room.workflow ?? defaultWorkflow()),
    roomBusPolicy: clone(room.roomBusPolicy ?? defaultRoomBusPolicy(room.roleCards)),
  };

  return createTeamTemplate(workspaceRootPath, templateInput);
}

export function updateRoomRolePrompt(
  workspaceRootPath: string,
  roomId: string,
  roleCardId: string,
  prompt: string
): Room {
  const room = loadRoom(workspaceRootPath, roomId);
  if (!room) {
    throw new Error(`Room not found: ${roomId}`);
  }

  const role = room.roleCards.find((item) => item.id === roleCardId);
  if (!role) {
    throw new Error(`Role card not found in room: ${roleCardId}`);
  }

  role.prompt = prompt;
  saveRoom(workspaceRootPath, room);
  return loadRoom(workspaceRootPath, roomId)!;
}
