import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProject, createTeamTemplate, loadRoom, saveRoom } from '../storage.ts';
import { createRoomFromTemplate } from '../room-operations.ts';
import { publishRoomBusEvent, resolveRoomBusTargets } from '../room-bus.ts';
import type { Artifact, RoleCard, Room, RoomBusEvent, RoomBusPolicy, Task, WorkflowTemplate } from '../types.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeWorkspaceRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'native-agent-room-p2-'));
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
    allowedActions: ['ask_agent', 'answer_agent', 'raise_blocker', 'request_review', 'review_result', 'handoff_task', 'artifact_update', 'announcement'],
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
    steps: [],
  };
}

function makePolicy(): RoomBusPolicy {
  return {
    allowedActions: ['ask_agent', 'answer_agent', 'raise_blocker', 'request_review', 'review_result', 'handoff_task', 'artifact_update', 'announcement'],
    maxRequestsPerAgentTurn: 3,
    defaultTtlMs: 24 * 60 * 60 * 1000,
    maxHops: 2,
  };
}

function setupRoom(workspaceRoot: string): Room {
  const project = createProject(workspaceRoot, { name: 'Acme SaaS Website' });
  const template = createTeamTemplate(workspaceRoot, {
    projectId: project.id,
    name: 'Page Development Team',
    roles: [
      makeRoleCard('role_frontend', 'frontend', 'Frontend Agent'),
      makeRoleCard('role_backend', 'backend', 'Backend API Agent'),
      makeRoleCard('role_qa', 'qa', 'QA Agent'),
    ],
    defaultWorkflow: makeWorkflow(),
    roomBusPolicy: makePolicy(),
  });
  return createRoomFromTemplate(workspaceRoot, {
    projectId: project.id,
    templateId: template.id,
    name: 'Pricing Page Room',
    goal: 'Develop SaaS pricing page',
  });
}

function addTaskAndArtifact(room: Room): Room {
  const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
  const backend = room.members.find((member) => member.roleKey === 'backend')!;
  const now = Date.now();
  const artifact: Artifact = {
    id: 'artifact_api_contract',
    projectId: room.projectId,
    roomId: room.id,
    name: 'api-contract-pricing.json',
    type: 'api_contract',
    scope: 'room',
    ownerAgentId: backend.id,
    version: 1,
    status: 'approved',
    tags: ['api'],
    contentRef: 'room/api-contract-pricing.json',
    createdAt: now,
    updatedAt: now,
  };
  const task: Task = {
    id: 'task_frontend_pricing',
    roomId: room.id,
    title: 'Implement Pricing Page',
    description: 'Build pricing UI.',
    ownerAgentId: frontend.id,
    phase: 'implementation',
    status: 'in_progress',
    inputArtifactIds: [artifact.id],
    outputArtifactIds: [],
    dependencyTaskIds: [],
    doneCriteria: ['Implemented'],
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...room,
    tasks: [task],
    artifacts: [artifact],
  };
}

describe('native agent room bus: P2', () => {
  it('records ask_agent and routes it to target and sender inboxes', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const room = setupRoom(workspaceRoot);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;

    const event = publishRoomBusEvent(workspaceRoot, {
      roomId: room.id,
      from: frontend.id,
      to: [{ type: 'agent', id: backend.id }],
      type: 'ask_agent',
      payload: {
        message: 'api-contract v1 is missing yearlyPrice.',
        expectedOutput: 'Updated API contract or explanation.',
      },
    });

    const reloaded = loadRoom(workspaceRoot, room.id)!;
    expect(reloaded.events).toHaveLength(1);
    expect(reloaded.events[0]).toMatchObject({
      id: event.id,
      from: frontend.id,
      type: 'ask_agent',
      status: 'open',
    });
    expect(reloaded.inboxes.find((inbox) => inbox.agentId === backend.id)?.items[0]).toMatchObject({
      eventId: event.id,
      type: 'request',
      status: 'unread',
      priority: 'normal',
    });
    expect(reloaded.inboxes.find((inbox) => inbox.agentId === frontend.id)?.items[0]?.eventId).toBe(event.id);
  });

  it('routes role, all, task, and artifact targets to matching agent inboxes', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const room = addTaskAndArtifact(setupRoom(workspaceRoot));
    saveRoom(workspaceRoot, room);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;
    const qa = room.members.find((member) => member.roleKey === 'qa')!;

    expect(resolveRoomBusTargets(room, [{ type: 'role', roleKey: 'backend' }])).toEqual([backend.id]);
    expect(resolveRoomBusTargets(room, [{ type: 'task', id: 'task_frontend_pricing' }])).toEqual([frontend.id]);
    expect(resolveRoomBusTargets(room, [{ type: 'artifact', id: 'artifact_api_contract' }]).sort()).toEqual([
      backend.id,
      frontend.id,
    ].sort());

    const event = publishRoomBusEvent(workspaceRoot, {
      roomId: room.id,
      from: 'system',
      to: [{ type: 'all' }],
      type: 'announcement',
      payload: { message: 'Use design tokens for all page rooms.' },
    });

    const reloaded = loadRoom(workspaceRoot, room.id)!;
    expect(reloaded.inboxes.find((inbox) => inbox.agentId === frontend.id)?.items.at(-1)?.eventId).toBe(event.id);
    expect(reloaded.inboxes.find((inbox) => inbox.agentId === backend.id)?.items.at(-1)?.eventId).toBe(event.id);
    expect(reloaded.inboxes.find((inbox) => inbox.agentId === qa.id)?.items.at(-1)?.eventId).toBe(event.id);
  });

  it('rejects request events without expectedOutput', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const room = setupRoom(workspaceRoot);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;

    expect(() => publishRoomBusEvent(workspaceRoot, {
      roomId: room.id,
      from: frontend.id,
      to: [{ type: 'agent', id: backend.id }],
      type: 'ask_agent',
      payload: { message: 'What is the API contract?' },
    })).toThrow('requires payload.expectedOutput');
  });

  it('updates task status for blocker and review request events', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const room = addTaskAndArtifact(setupRoom(workspaceRoot));
    saveRoom(workspaceRoot, room);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const qa = room.members.find((member) => member.roleKey === 'qa')!;

    publishRoomBusEvent(workspaceRoot, {
      roomId: room.id,
      from: frontend.id,
      to: [{ type: 'agent', id: qa.id }],
      type: 'request_review',
      taskId: 'task_frontend_pricing',
      payload: {
        message: 'Please review pricing page implementation.',
        expectedOutput: 'Review result with blocking issues if any.',
      },
    });

    expect(loadRoom(workspaceRoot, room.id)?.tasks[0]?.status).toBe('waiting_review');

    publishRoomBusEvent(workspaceRoot, {
      roomId: room.id,
      from: qa.id,
      to: [{ type: 'agent', id: frontend.id }],
      type: 'review_result',
      taskId: 'task_frontend_pricing',
      payload: {
        message: 'Mobile pricing card overflows.',
        severity: 'blocking',
      },
    });

    expect(loadRoom(workspaceRoot, room.id)?.tasks[0]?.status).toBe('changes_requested');
  });

  it('resolves parent request when answer_agent replies', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const room = setupRoom(workspaceRoot);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;

    const request = publishRoomBusEvent(workspaceRoot, {
      roomId: room.id,
      from: frontend.id,
      to: [{ type: 'agent', id: backend.id }],
      type: 'ask_agent',
      payload: {
        message: 'Please provide yearlyPrice.',
        expectedOutput: 'Updated API contract.',
      },
    });

    publishRoomBusEvent(workspaceRoot, {
      roomId: room.id,
      from: backend.id,
      to: [{ type: 'agent', id: frontend.id }],
      type: 'answer_agent',
      parentEventId: request.id,
      payload: { message: 'yearlyPrice added.' },
    });

    const reloaded = loadRoom(workspaceRoot, room.id)!;
    expect(reloaded.events.find((event) => event.id === request.id)?.status).toBe('resolved');
    expect(reloaded.events.find((event) => event.id === request.id)?.resolvedAt).toBeNumber();
  });

  it('prevents repeated parent-chain loops', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const room = setupRoom(workspaceRoot);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;

    const first = publishRoomBusEvent(workspaceRoot, {
      roomId: room.id,
      from: frontend.id,
      to: [{ type: 'agent', id: backend.id }],
      type: 'ask_agent',
      payload: {
        message: 'Need API contract.',
        expectedOutput: 'API contract.',
      },
    });
    const second = publishRoomBusEvent(workspaceRoot, {
      roomId: room.id,
      from: backend.id,
      to: [{ type: 'agent', id: frontend.id }],
      type: 'ask_agent',
      parentEventId: first.id,
      payload: {
        message: 'Need UI requirements first.',
        expectedOutput: 'UI requirements.',
      },
    });

    expect(() => publishRoomBusEvent(workspaceRoot, {
      roomId: room.id,
      from: frontend.id,
      to: [{ type: 'agent', id: backend.id }],
      type: 'ask_agent',
      parentEventId: second.id,
      payload: {
        message: 'Still need API contract.',
        expectedOutput: 'API contract.',
      },
    })).toThrow('RoomBus loop detected');
  });
});
