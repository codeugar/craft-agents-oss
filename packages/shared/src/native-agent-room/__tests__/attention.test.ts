import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { addProjectArtifact, createProject, createTeamTemplate, loadRoom, saveRoom } from '../storage.ts';
import { createRoomFromTemplate } from '../room-operations.ts';
import { publishRoomBusEvent } from '../room-bus.ts';
import { resolveContextPack, resolveMentionTargets } from '../attention.ts';
import type {
  Artifact,
  Decision,
  RoleCard,
  Room,
  RoomBusPolicy,
  Task,
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
  const dir = mkdtempSync(join(tmpdir(), 'native-agent-room-p3-'));
  tempDirs.push(dir);
  return dir;
}

function makeRoleCard(id: string, roleKey: string, name: string, requiredArtifactTypes: Artifact['type'][] = []): RoleCard {
  return {
    id,
    roleKey,
    name,
    mission: `${name} mission`,
    prompt: `${name} prompt`,
    responsibilities: [`${name} responsibility`],
    inputs: [],
    outputs: [],
    allowedActions: ['ask_agent', 'answer_agent', 'request_review', 'review_result', 'artifact_update', 'announcement'],
    forbiddenActions: [],
    doneCriteria: ['Done'],
    contextPolicy: {
      alwaysInclude: ['role_contract', 'member_directory', 'current_task', 'required_artifacts'],
      requiredArtifactTypes,
      optionalArtifactTypes: [],
      includeEvents: ['ask_agent', 'answer_agent', 'artifact_update', 'decision'],
      exclude: ['full_transcript', 'other_agents_private_memory', 'unrelated_rooms', 'deprecated_artifacts', 'rejected_decisions'],
      subscriptions: [],
    },
  };
}

function makeWorkflow(): WorkflowTemplate {
  return {
    phases: ['clarify', 'plan', 'foundation', 'design', 'implementation', 'review', 'deliver'],
    steps: [],
  };
}

function makePolicy(): RoomBusPolicy {
  return {
    allowedActions: ['message', 'ask_agent', 'answer_agent', 'request_review', 'review_result', 'artifact_update', 'decision', 'announcement'],
    maxRequestsPerAgentTurn: 3,
    defaultTtlMs: 24 * 60 * 60 * 1000,
    maxHops: 4,
  };
}

function setupRoom(workspaceRoot: string): Room {
  const project = createProject(workspaceRoot, { name: 'Acme SaaS Website' });
  addProjectArtifact(workspaceRoot, project.id, {
    id: 'artifact_design_tokens',
    projectId: project.id,
    name: 'design-tokens.json',
    type: 'design_tokens',
    scope: 'project',
    version: 3,
    status: 'approved',
    tags: ['design'],
    contentRef: 'project/design-tokens.json',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  addProjectArtifact(workspaceRoot, project.id, {
    id: 'artifact_deprecated_tokens',
    projectId: project.id,
    name: 'old-design-tokens.json',
    type: 'design_tokens',
    scope: 'project',
    version: 1,
    status: 'deprecated',
    tags: ['design'],
    contentRef: 'project/old-design-tokens.json',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const template = createTeamTemplate(workspaceRoot, {
    projectId: project.id,
    name: 'Page Development Team',
    roles: [
      makeRoleCard('role_frontend', 'frontend', 'Frontend Agent', ['ui_spec', 'design_tokens', 'api_contract']),
      makeRoleCard('role_backend', 'backend', 'Backend API Agent', ['api_contract']),
      makeRoleCard('role_qa', 'qa', 'QA Agent', ['ui_spec', 'test_plan']),
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

function addContextFacts(room: Room): Room {
  const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
  const backend = room.members.find((member) => member.roleKey === 'backend')!;
  const now = Date.now();
  const uiSpec: Artifact = {
    id: 'artifact_ui_spec',
    projectId: room.projectId,
    roomId: room.id,
    name: 'pricing-ui-spec.md',
    type: 'ui_spec',
    scope: 'room',
    ownerAgentId: frontend.id,
    version: 2,
    status: 'approved',
    tags: ['ui'],
    contentRef: 'room/pricing-ui-spec.md',
    createdAt: now,
    updatedAt: now,
  };
  const apiContract: Artifact = {
    id: 'artifact_api_contract',
    projectId: room.projectId,
    roomId: room.id,
    name: 'api-contract-pricing.json',
    type: 'api_contract',
    scope: 'room',
    ownerAgentId: backend.id,
    version: 2,
    status: 'approved',
    tags: ['api'],
    contentRef: 'room/api-contract-pricing.json',
    createdAt: now,
    updatedAt: now,
  };
  const deprecatedUiSpec: Artifact = {
    ...uiSpec,
    id: 'artifact_old_ui_spec',
    name: 'old-pricing-ui-spec.md',
    version: 1,
    status: 'deprecated',
    contentRef: 'room/old-pricing-ui-spec.md',
  };
  const task: Task = {
    id: 'task_frontend_pricing',
    roomId: room.id,
    title: 'Implement Pricing Page',
    description: 'Build pricing page from approved specs.',
    ownerAgentId: frontend.id,
    phase: 'implementation',
    status: 'in_progress',
    inputArtifactIds: [uiSpec.id, apiContract.id],
    outputArtifactIds: [],
    dependencyTaskIds: [],
    doneCriteria: ['Implementation follows UI spec and API contract'],
    createdAt: now,
    updatedAt: now,
  };
  const approvedDecision: Decision = {
    id: 'decision_billing_toggle',
    projectId: room.projectId,
    roomId: room.id,
    title: 'Use monthly and annual billing toggle',
    description: 'Pricing cards support monthly and annual billing.',
    scope: 'room',
    status: 'approved',
    relatedTaskIds: [task.id],
    relatedArtifactIds: [apiContract.id],
    createdBy: 'user',
    approvedBy: 'user',
    createdAt: now,
    updatedAt: now,
  };
  const rejectedDecision: Decision = {
    ...approvedDecision,
    id: 'decision_rejected_layout',
    title: 'Rejected layout',
    status: 'rejected',
  };
  const timeline: TimelineItem = {
    id: 'timeline_implementation_started',
    roomId: room.id,
    title: 'Implementation started',
    description: 'Frontend started implementation.',
    phase: 'implementation',
    sourceEventIds: [],
    sourceArtifactIds: [uiSpec.id, apiContract.id],
    sourceDecisionIds: [approvedDecision.id],
    createdAt: now,
  };

  return {
    ...room,
    tasks: [task],
    artifacts: [uiSpec, apiContract, deprecatedUiSpec],
    decisions: [approvedDecision, rejectedDecision],
    timeline: [timeline],
  };
}

describe('native agent room attention and context resolver: P3', () => {
  it('extracts @Agent, @Role, @all, @task, and @artifact targets', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const room = addContextFacts(setupRoom(workspaceRoot));

    expect(resolveMentionTargets(room, '@Frontend please confirm').map((target) => target.type)).toEqual(['agent']);
    expect(resolveMentionTargets(room, '@backend please answer')).toEqual([{ type: 'agent', id: room.members.find((member) => member.roleKey === 'backend')!.id }]);
    expect(resolveMentionTargets(room, '@all sync')).toEqual([{ type: 'all' }]);
    expect(resolveMentionTargets(room, '@task:task_frontend_pricing review')).toEqual([{ type: 'task', id: 'task_frontend_pricing' }]);
    expect(resolveMentionTargets(room, '@artifact:artifact_api_contract updated')).toEqual([{ type: 'artifact', id: 'artifact_api_contract' }]);
  });

  it('routes explicit @ mentions into the matching agent inbox', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const room = setupRoom(workspaceRoot);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;

    const event = publishRoomBusEvent(workspaceRoot, {
      roomId: room.id,
      from: 'user',
      type: 'message',
      payload: { message: '@Frontend please confirm annual toggle state handling.' },
    });

    const reloaded = loadRoom(workspaceRoot, room.id)!;
    expect(reloaded.inboxes.find((inbox) => inbox.agentId === frontend.id)?.items[0]?.eventId).toBe(event.id);
    expect(reloaded.inboxes.find((inbox) => inbox.agentId === backend.id)?.items).toEqual([]);
  });

  it('routes artifact updates to artifact owner and dependent task owner without explicit to', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const room = addContextFacts(setupRoom(workspaceRoot));
    saveRoom(workspaceRoot, room);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;

    const event = publishRoomBusEvent(workspaceRoot, {
      roomId: room.id,
      from: backend.id,
      type: 'artifact_update',
      artifactId: 'artifact_api_contract',
      payload: { message: 'api-contract-pricing.json updated to v2.' },
    });

    const reloaded = loadRoom(workspaceRoot, room.id)!;
    expect(reloaded.inboxes.find((inbox) => inbox.agentId === frontend.id)?.items.at(-1)?.eventId).toBe(event.id);
    expect(reloaded.inboxes.find((inbox) => inbox.agentId === backend.id)?.items.at(-1)?.eventId).toBe(event.id);
  });

  it('routes decisions to related task and artifact owners', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const room = addContextFacts(setupRoom(workspaceRoot));
    saveRoom(workspaceRoot, room);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;

    const event = publishRoomBusEvent(workspaceRoot, {
      roomId: room.id,
      from: 'user',
      type: 'decision',
      decisionId: 'decision_billing_toggle',
      payload: { message: 'Decision approved: monthly and annual billing toggle.' },
    });

    const reloaded = loadRoom(workspaceRoot, room.id)!;
    expect(reloaded.inboxes.find((inbox) => inbox.agentId === frontend.id)?.items.at(-1)?.eventId).toBe(event.id);
    expect(reloaded.inboxes.find((inbox) => inbox.agentId === backend.id)?.items.at(-1)?.eventId).toBe(event.id);
  });

  it('builds a Context Pack with required facts and without unrelated transcript facts', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const room = addContextFacts(setupRoom(workspaceRoot));
    saveRoom(workspaceRoot, room);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;
    const qa = room.members.find((member) => member.roleKey === 'qa')!;

    const relevant = publishRoomBusEvent(workspaceRoot, {
      roomId: room.id,
      from: backend.id,
      type: 'artifact_update',
      artifactId: 'artifact_api_contract',
      payload: { message: 'api-contract-pricing.json updated to v2.' },
    });
    const unrelated = publishRoomBusEvent(workspaceRoot, {
      roomId: room.id,
      from: qa.id,
      to: [{ type: 'agent', id: backend.id }],
      type: 'message',
      payload: { message: 'Internal QA note for backend only.' },
    });

    const pack = resolveContextPack(workspaceRoot, {
      roomId: room.id,
      agentId: frontend.id,
      taskId: 'task_frontend_pricing',
      triggerEventId: relevant.id,
    });

    expect(pack.roleContext.roleKey).toBe('frontend');
    expect(pack.memberDirectory.map((member) => member.roleKey).sort()).toEqual(['backend', 'frontend', 'qa']);
    expect(pack.currentTask?.id).toBe('task_frontend_pricing');
    expect(pack.requiredArtifacts.map((artifact) => artifact.name).sort()).toEqual([
      'api-contract-pricing.json',
      'design-tokens.json',
      'pricing-ui-spec.md',
    ]);
    expect(pack.requiredArtifacts.some((artifact) => artifact.status === 'deprecated')).toBe(false);
    expect(pack.relevantDecisions.map((decision) => decision.id)).toEqual(['decision_billing_toggle']);
    expect(pack.attentionEvents.map((event) => event.id)).toContain(relevant.id);
    expect(pack.attentionEvents.map((event) => event.id)).not.toContain(unrelated.id);
    expect(pack.timeline.map((item) => item.id)).toEqual(['timeline_implementation_started']);
    expect(pack.contextUsed.some((item) => item.type === 'artifact' && item.label === 'api-contract-pricing.json@v2')).toBe(true);
    expect(pack.contextUsed.some((item) => item.type === 'decision' && item.id === 'decision_billing_toggle')).toBe(true);
  });
});
