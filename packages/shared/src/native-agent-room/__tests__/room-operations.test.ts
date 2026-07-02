import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createProject,
  createTeamTemplate,
  loadRoom,
  loadTeamTemplate,
  saveRoom,
} from '../storage.ts';
import {
  createRoomFromTemplate,
  duplicateRoomConfig,
  forkRoom,
  saveRoomAsTeamTemplate,
  updateRoomRolePrompt,
} from '../room-operations.ts';
import type {
  Artifact,
  Decision,
  InboxItem,
  RoleCard,
  Room,
  RoomBusEvent,
  RoomBusPolicy,
  Task,
  TeamTemplate,
  TimelineItem,
  WorkflowTemplate,
} from '../types.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeWorkspaceRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'native-agent-room-p1-'));
  tempDirs.push(dir);
  return dir;
}

function makeRoleCard(id: string, roleKey: string, name: string): RoleCard {
  return {
    id,
    roleKey,
    name,
    mission: `${name} mission`,
    prompt: `${name} prompt`,
    responsibilities: [`${name} responsibility`],
    inputs: [],
    outputs: [],
    allowedActions: ['ask_agent', 'answer_agent', 'request_review', 'review_result', 'artifact_update'],
    forbiddenActions: [],
    doneCriteria: ['Done'],
    contextPolicy: {
      alwaysInclude: ['role_contract', 'member_directory', 'current_task'],
      requiredArtifactTypes: [],
      optionalArtifactTypes: [],
      includeEvents: ['ask_agent', 'answer_agent', 'artifact_update'],
      exclude: ['full_transcript', 'other_agents_private_memory'],
      subscriptions: [],
    },
  };
}

function makeWorkflow(): WorkflowTemplate {
  return {
    phases: ['clarify', 'plan', 'implementation', 'review', 'deliver'],
    steps: [
      {
        id: 'step_implementation',
        phase: 'implementation',
        title: 'Implement page',
        roleKeys: ['frontend'],
      },
    ],
  };
}

function makePolicy(): RoomBusPolicy {
  return {
    allowedActions: ['ask_agent', 'answer_agent', 'request_review', 'review_result', 'artifact_update'],
    maxRequestsPerAgentTurn: 3,
    defaultTtlMs: 24 * 60 * 60 * 1000,
    maxHops: 4,
  };
}

function setupTemplate(workspaceRoot: string): { projectId: string; template: TeamTemplate } {
  const project = createProject(workspaceRoot, { name: 'Acme SaaS Website' });
  const template = createTeamTemplate(workspaceRoot, {
    projectId: project.id,
    name: 'Page Development Team',
    roles: [
      makeRoleCard('role_frontend', 'frontend', 'Frontend Agent'),
      makeRoleCard('role_backend', 'backend', 'Backend API Agent'),
    ],
    defaultWorkflow: makeWorkflow(),
    roomBusPolicy: makePolicy(),
  });
  return { projectId: project.id, template };
}

function addRoomHistory(room: Room): Room {
  const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
  const backend = room.members.find((member) => member.roleKey === 'backend')!;
  const now = Date.now();
  const task: Task = {
    id: 'task_frontend_pricing',
    roomId: room.id,
    title: 'Implement Pricing Page',
    description: 'Build the pricing page UI.',
    ownerAgentId: frontend.id,
    phase: 'implementation',
    status: 'in_progress',
    inputArtifactIds: ['artifact_api_contract'],
    outputArtifactIds: ['artifact_implementation'],
    dependencyTaskIds: [],
    doneCriteria: ['Pricing page implemented'],
    createdAt: now,
    updatedAt: now,
  };
  const artifact: Artifact = {
    id: 'artifact_api_contract',
    projectId: room.projectId,
    roomId: room.id,
    taskId: task.id,
    name: 'api-contract-pricing.json',
    type: 'api_contract',
    scope: 'task',
    ownerAgentId: backend.id,
    version: 1,
    status: 'approved',
    tags: ['api'],
    contentRef: 'room/api-contract-pricing.json',
    createdAt: now,
    updatedAt: now,
  };
  const decision: Decision = {
    id: 'decision_billing_period',
    projectId: room.projectId,
    roomId: room.id,
    title: 'Use monthly and annual billing toggle',
    description: 'Pricing page supports monthly and annual billing.',
    scope: 'room',
    status: 'approved',
    relatedTaskIds: [task.id],
    relatedArtifactIds: [artifact.id],
    createdBy: frontend.id,
    approvedBy: 'user',
    createdAt: now,
    updatedAt: now,
  };
  const event: RoomBusEvent = {
    id: 'event_api_request',
    projectId: room.projectId,
    roomId: room.id,
    from: frontend.id,
    to: [{ type: 'agent', id: backend.id }],
    type: 'ask_agent',
    taskId: task.id,
    artifactId: artifact.id,
    payload: {
      message: 'Please provide pricing API fields.',
      expectedOutput: 'Updated API contract.',
    },
    status: 'open',
    createdAt: now,
  };
  const inboxItem: InboxItem = {
    id: 'inbox_item_api_request',
    eventId: event.id,
    type: 'request',
    status: 'unread',
    priority: 'normal',
    createdAt: now,
  };
  const timelineItem: TimelineItem = {
    id: 'timeline_api_request',
    roomId: room.id,
    title: 'Frontend requested API contract',
    description: 'Frontend asked Backend for pricing API fields.',
    phase: 'implementation',
    sourceEventIds: [event.id],
    sourceArtifactIds: [artifact.id],
    sourceDecisionIds: [decision.id],
    createdAt: now,
  };

  frontend.ownedTaskIds = [task.id];
  backend.ownedArtifactIds = [artifact.id];

  return {
    ...room,
    tasks: [task],
    artifacts: [artifact],
    decisions: [decision],
    events: [event],
    inboxes: room.inboxes.map((inbox) =>
      inbox.agentId === backend.id ? { ...inbox, items: [inboxItem] } : inbox
    ),
    timeline: [timelineItem],
  };
}

describe('native agent room operations: P1', () => {
  it('creates a room from a team template with role members and inboxes', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const { projectId, template } = setupTemplate(workspaceRoot);

    const room = createRoomFromTemplate(workspaceRoot, {
      projectId,
      templateId: template.id,
      name: 'Pricing Page Room',
      goal: 'Develop SaaS pricing page',
    });

    expect(room.templateId).toBe(template.id);
    expect(room.roleCards.map((role) => role.roleKey)).toEqual(['frontend', 'backend']);
    expect(room.members.map((member) => member.roleKey)).toEqual(['frontend', 'backend']);
    expect(room.inboxes).toHaveLength(2);
    expect(room.workflow).toEqual(template.defaultWorkflow);
    expect(room.roomBusPolicy).toEqual(template.roomBusPolicy);
  });

  it('duplicates room config without copying room history or artifacts', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const { projectId, template } = setupTemplate(workspaceRoot);
    const source = createRoomFromTemplate(workspaceRoot, {
      projectId,
      templateId: template.id,
      name: 'Pricing Page Room',
      goal: 'Develop SaaS pricing page',
    });
    const sourceWithHistory = addRoomHistory(source);
    saveRoom(workspaceRoot, sourceWithHistory);

    const duplicate = duplicateRoomConfig(workspaceRoot, {
      sourceRoomId: source.id,
      name: 'Features Page Room',
      goal: 'Develop features page',
    });

    expect(duplicate.id).not.toBe(source.id);
    expect(duplicate.roleCards).toEqual(source.roleCards);
    expect(duplicate.workflow).toEqual(source.workflow);
    expect(duplicate.roomBusPolicy).toEqual(source.roomBusPolicy);
    expect(duplicate.members).toHaveLength(source.members.length);
    expect(duplicate.tasks).toEqual([]);
    expect(duplicate.artifacts).toEqual([]);
    expect(duplicate.decisions).toEqual([]);
    expect(duplicate.events).toEqual([]);
    expect(duplicate.timeline).toEqual([]);
    expect(duplicate.inboxes.every((inbox) => inbox.items.length === 0)).toBe(true);
  });

  it('forks a room with history and remapped room-scoped ids', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const { projectId, template } = setupTemplate(workspaceRoot);
    const source = createRoomFromTemplate(workspaceRoot, {
      projectId,
      templateId: template.id,
      name: 'Pricing Page Room',
      goal: 'Develop SaaS pricing page',
    });
    const sourceWithHistory = addRoomHistory(source);
    saveRoom(workspaceRoot, sourceWithHistory);

    const forked = forkRoom(workspaceRoot, {
      sourceRoomId: source.id,
      name: 'Pricing Page Room - Variant A',
    });

    expect(forked.id).not.toBe(source.id);
    expect(forked.forkedFromRoomId).toBe(source.id);
    expect(forked.tasks).toHaveLength(1);
    expect(forked.artifacts).toHaveLength(1);
    expect(forked.decisions).toHaveLength(1);
    expect(forked.events).toHaveLength(1);
    expect(forked.timeline).toHaveLength(1);
    expect(forked.tasks[0]!.id).not.toBe(sourceWithHistory.tasks[0]!.id);
    expect(forked.tasks[0]!.roomId).toBe(forked.id);
    expect(forked.artifacts[0]!.roomId).toBe(forked.id);
    expect(forked.events[0]!.roomId).toBe(forked.id);
    expect(forked.timeline[0]!.roomId).toBe(forked.id);
    expect(forked.inboxes.some((inbox) => inbox.items.length === 1)).toBe(true);
  });

  it('saves room configuration as a team template without room history', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const { projectId, template } = setupTemplate(workspaceRoot);
    const room = createRoomFromTemplate(workspaceRoot, {
      projectId,
      templateId: template.id,
      name: 'Pricing Page Room',
      goal: 'Develop SaaS pricing page',
    });
    saveRoom(workspaceRoot, addRoomHistory(room));

    const savedTemplate = saveRoomAsTeamTemplate(workspaceRoot, {
      roomId: room.id,
      name: 'Saved Page Team',
      description: 'Reusable page development team',
    });

    const reloaded = loadTeamTemplate(workspaceRoot, savedTemplate.id)!;
    expect(reloaded.name).toBe('Saved Page Team');
    expect(reloaded.roles.map((role) => role.roleKey)).toEqual(['frontend', 'backend']);
    expect(reloaded.defaultWorkflow).toEqual(room.workflow!);
    expect(reloaded.roomBusPolicy).toEqual(room.roomBusPolicy!);
    expect('tasks' in reloaded).toBe(false);
    expect('artifacts' in reloaded).toBe(false);
  });

  it('updates a room role prompt without changing the source template', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const { projectId, template } = setupTemplate(workspaceRoot);
    const room = createRoomFromTemplate(workspaceRoot, {
      projectId,
      templateId: template.id,
      name: 'Pricing Page Room',
      goal: 'Develop SaaS pricing page',
    });

    const updated = updateRoomRolePrompt(
      workspaceRoot,
      room.id,
      'role_frontend',
      'Use the approved pricing artifacts before implementation.'
    );

    expect(updated.roleCards.find((role) => role.id === 'role_frontend')?.prompt)
      .toBe('Use the approved pricing artifacts before implementation.');
    expect(loadRoom(workspaceRoot, room.id)?.roleCards.find((role) => role.id === 'role_frontend')?.prompt)
      .toBe('Use the approved pricing artifacts before implementation.');
    expect(loadTeamTemplate(workspaceRoot, template.id)?.roles.find((role) => role.id === 'role_frontend')?.prompt)
      .toBe('Frontend Agent prompt');
  });
});
