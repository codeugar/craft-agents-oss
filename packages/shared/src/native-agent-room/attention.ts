import { loadProject, loadRoom } from './storage.ts';
import type {
  Artifact,
  ContextPack,
  ContextUsedItem,
  Decision,
  Room,
  RoomBusEvent,
  RoomMember,
  RoomMemberSummary,
  TargetRef,
  Task,
} from './types.ts';

export interface ResolveContextPackInput {
  roomId: string;
  agentId: string;
  taskId?: string;
  triggerEventId?: string;
}

type EventLike = Pick<RoomBusEvent, 'type' | 'from' | 'to' | 'taskId' | 'artifactId' | 'decisionId' | 'payload' | 'status'>;

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function payloadMessage(payload: Record<string, unknown>): string {
  return typeof payload.message === 'string' ? payload.message : '';
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function targetToAgentIds(room: Room, target: TargetRef): string[] {
  if (target.type === 'all') {
    return room.members.map((member) => member.id);
  }

  if (target.type === 'agent') {
    return room.members.some((member) => member.id === target.id) ? [target.id] : [];
  }

  if (target.type === 'role') {
    return room.members
      .filter((member) => member.roleKey === target.roleKey)
      .map((member) => member.id);
  }

  if (target.type === 'task') {
    const task = room.tasks.find((item) => item.id === target.id);
    return task ? [task.ownerAgentId] : [];
  }

  const artifact = room.artifacts.find((item) => item.id === target.id);
  if (!artifact) return [];

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

function findAgentOrRoleTarget(room: Room, token: string): TargetRef | null {
  const normalized = normalizeToken(token);
  const member = room.members.find((item) =>
    normalizeToken(item.id) === normalized ||
    normalizeToken(item.name) === normalized ||
    normalizeToken(item.roleKey) === normalized
  );
  if (member) {
    return { type: 'agent', id: member.id };
  }

  const role = room.roleCards.find((item) =>
    normalizeToken(item.id) === normalized ||
    normalizeToken(item.name) === normalized ||
    normalizeToken(item.roleKey) === normalized
  );
  if (role) {
    return { type: 'role', roleKey: role.roleKey };
  }

  return null;
}

export function resolveMentionTargets(room: Room, message: string): TargetRef[] {
  const targets: TargetRef[] = [];
  const mentionRegex = /@([A-Za-z0-9_-]+)(?::([A-Za-z0-9_-]+))?/g;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(message)) !== null) {
    const mentionType = match[1]!;
    const mentionValue = match[2];
    const normalizedType = normalizeToken(mentionType);

    if (normalizedType === 'all') {
      targets.push({ type: 'all' });
      continue;
    }

    if (normalizedType === 'task' && mentionValue) {
      if (room.tasks.some((task) => task.id === mentionValue)) {
        targets.push({ type: 'task', id: mentionValue });
      }
      continue;
    }

    if (normalizedType === 'artifact' && mentionValue) {
      if (room.artifacts.some((artifact) => artifact.id === mentionValue)) {
        targets.push({ type: 'artifact', id: mentionValue });
      }
      continue;
    }

    const agentOrRole = findAgentOrRoleTarget(room, mentionType);
    if (agentOrRole) {
      targets.push(agentOrRole);
    }
  }

  return targets;
}

export function resolveEventAttentionAgentIds(room: Room, event: EventLike): string[] {
  const agentIds = new Set<string>();
  const targets = [
    ...(event.to ?? []),
    ...resolveMentionTargets(room, payloadMessage(event.payload)),
  ];

  if (event.type === 'announcement' && targets.length === 0) {
    targets.push({ type: 'all' });
  }

  for (const target of targets) {
    for (const agentId of targetToAgentIds(room, target)) {
      agentIds.add(agentId);
    }
  }

  if (event.taskId) {
    const task = room.tasks.find((item) => item.id === event.taskId);
    if (task) {
      agentIds.add(task.ownerAgentId);
    }
  }

  if (event.artifactId) {
    for (const agentId of targetToAgentIds(room, { type: 'artifact', id: event.artifactId })) {
      agentIds.add(agentId);
    }
  }

  if (event.decisionId) {
    const decision = room.decisions.find((item) => item.id === event.decisionId);
    if (decision) {
      for (const taskId of decision.relatedTaskIds) {
        for (const agentId of targetToAgentIds(room, { type: 'task', id: taskId })) {
          agentIds.add(agentId);
        }
      }
      for (const artifactId of decision.relatedArtifactIds) {
        for (const agentId of targetToAgentIds(room, { type: 'artifact', id: artifactId })) {
          agentIds.add(agentId);
        }
      }
    }
  }

  return [...agentIds];
}

function buildMemberSummary(room: Room, member: RoomMember): RoomMemberSummary {
  const role = room.roleCards.find((item) => item.id === member.roleCardId);
  return {
    id: member.id,
    name: member.name,
    roleKey: member.roleKey,
    status: member.status,
    responsibilities: role?.responsibilities ?? [],
    allowedActions: role?.allowedActions ?? [],
  };
}

function findCurrentTask(room: Room, agentId: string, taskId?: string): Task | undefined {
  if (taskId) {
    return room.tasks.find((task) => task.id === taskId && task.ownerAgentId === agentId);
  }

  return room.tasks.find((task) =>
    task.ownerAgentId === agentId && !['done'].includes(task.status)
  ) ?? room.tasks.find((task) => task.ownerAgentId === agentId);
}

function artifactMatchesRoleOrTask(artifact: Artifact, roleRequiredTypes: string[], currentTask?: Task): boolean {
  if (artifact.status === 'deprecated') return false;
  if (currentTask?.inputArtifactIds.includes(artifact.id)) return true;
  if (currentTask?.outputArtifactIds.includes(artifact.id)) return true;
  return roleRequiredTypes.includes(artifact.type);
}

function selectRequiredArtifacts(room: Room, projectArtifacts: Artifact[], roleRequiredTypes: string[], currentTask?: Task): Artifact[] {
  const artifacts = [...projectArtifacts, ...room.artifacts];
  const byId = new Map<string, Artifact>();

  for (const artifact of artifacts) {
    if (artifactMatchesRoleOrTask(artifact, roleRequiredTypes, currentTask)) {
      byId.set(artifact.id, artifact);
    }
  }

  return [...byId.values()];
}

function isDecisionRelevant(decision: Decision, currentTask: Task | undefined, requiredArtifacts: Artifact[]): boolean {
  if (decision.status === 'rejected') return false;
  if (!currentTask) return decision.scope === 'project' || decision.scope === 'room';
  if (decision.relatedTaskIds.includes(currentTask.id)) return true;

  const artifactIds = new Set(requiredArtifacts.map((artifact) => artifact.id));
  return decision.relatedArtifactIds.some((artifactId) => artifactIds.has(artifactId));
}

function isEventRelevant(room: Room, event: RoomBusEvent, agentId: string, currentTask: Task | undefined, triggerEventId?: string): boolean {
  if (event.id === triggerEventId) return true;
  if (resolveEventAttentionAgentIds(room, event).includes(agentId)) return true;
  if (event.from === agentId && event.status === 'open') return true;
  if (currentTask && event.taskId === currentTask.id) return true;
  return false;
}

function contextUsedFromPack(parts: {
  roleId: string;
  memberDirectory: RoomMemberSummary[];
  currentTask?: Task;
  artifacts: Artifact[];
  events: RoomBusEvent[];
  decisions: Decision[];
  timeline: ContextPack['timeline'];
  inboxItems: ContextPack['inboxItems'];
}): ContextUsedItem[] {
  const items: ContextUsedItem[] = [
    { type: 'role', id: parts.roleId, label: 'RoleCard' },
    { type: 'member_directory', id: 'member_directory', label: `${parts.memberDirectory.length} room members` },
  ];

  if (parts.currentTask) {
    items.push({ type: 'task', id: parts.currentTask.id, label: parts.currentTask.title });
  }

  for (const artifact of parts.artifacts) {
    items.push({ type: 'artifact', id: artifact.id, label: `${artifact.name}@v${artifact.version}` });
  }
  for (const event of parts.events) {
    items.push({ type: 'event', id: event.id, label: event.type });
  }
  for (const decision of parts.decisions) {
    items.push({ type: 'decision', id: decision.id, label: decision.title });
  }
  for (const item of parts.timeline) {
    items.push({ type: 'timeline', id: item.id, label: item.title });
  }
  for (const item of parts.inboxItems) {
    items.push({ type: 'inbox', id: item.id, label: item.type });
  }

  return items;
}

export function resolveContextPack(
  workspaceRootPath: string,
  input: ResolveContextPackInput
): ContextPack {
  const room = loadRoom(workspaceRootPath, input.roomId);
  if (!room) {
    throw new Error(`Room not found: ${input.roomId}`);
  }

  const member = room.members.find((item) => item.id === input.agentId);
  if (!member) {
    throw new Error(`Agent not found in room: ${input.agentId}`);
  }

  const role = room.roleCards.find((item) => item.id === member.roleCardId);
  if (!role) {
    throw new Error(`Role card not found in room: ${member.roleCardId}`);
  }

  const project = loadProject(workspaceRootPath, room.projectId);
  const projectArtifacts = project?.artifacts.filter((artifact) => artifact.status !== 'deprecated') ?? [];
  const currentTask = findCurrentTask(room, member.id, input.taskId);
  const requiredArtifacts = selectRequiredArtifacts(
    room,
    projectArtifacts,
    role.contextPolicy.requiredArtifactTypes,
    currentTask
  );
  const relevantDecisions = room.decisions
    .filter((decision) => isDecisionRelevant(decision, currentTask, requiredArtifacts));
  const attentionEvents = room.events
    .filter((event) => isEventRelevant(room, event, member.id, currentTask, input.triggerEventId));
  const inboxItems = room.inboxes
    .find((inbox) => inbox.agentId === member.id)
    ?.items.filter((item) => item.status !== 'dismissed') ?? [];
  const memberDirectory = room.members.map((item) => buildMemberSummary(room, item));
  const timeline = room.timeline.slice(-20);

  return {
    agentId: member.id,
    roomId: room.id,
    taskId: currentTask?.id,
    triggerEventId: input.triggerEventId,
    roleContext: role,
    memberDirectory,
    currentTask,
    requiredArtifacts,
    relevantDecisions,
    attentionEvents,
    inboxItems,
    timeline,
    contextUsed: contextUsedFromPack({
      roleId: role.id,
      memberDirectory,
      currentTask,
      artifacts: requiredArtifacts,
      events: attentionEvents,
      decisions: relevantDecisions,
      timeline,
      inboxItems,
    }),
  };
}
