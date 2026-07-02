import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  addProjectArtifact,
  createProject,
  createRoomRecord,
  createTeamTemplate,
  listProjects,
  listRoomAvailableArtifacts,
  listRooms,
  listTeamTemplates,
  loadProject,
  loadRoom,
  loadTeamTemplate,
} from '../storage.ts';
import type { Artifact, CreateTeamTemplateInput, RoleCard } from '../types.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeWorkspaceRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'native-agent-room-'));
  tempDirs.push(dir);
  return dir;
}

function makeRoleCard(overrides: Partial<RoleCard> = {}): RoleCard {
  return {
    id: 'role_frontend',
    name: 'Frontend Agent',
    roleKey: 'frontend',
    mission: 'Implement page UI',
    prompt: 'Build from approved artifacts.',
    responsibilities: ['Implement UI'],
    inputs: ['ui_spec', 'api_contract'],
    outputs: ['implementation'],
    allowedActions: ['ask_agent', 'request_review', 'artifact_update'],
    forbiddenActions: [],
    doneCriteria: ['Implementation matches approved artifacts'],
    contextPolicy: {
      alwaysInclude: ['role_contract', 'member_directory', 'current_task', 'required_artifacts'],
      requiredArtifactTypes: ['ui_spec', 'design_tokens', 'api_contract'],
      optionalArtifactTypes: [],
      includeEvents: ['ask_agent', 'answer_agent', 'artifact_update'],
      exclude: ['full_transcript', 'other_agents_private_memory', 'deprecated_artifacts'],
      subscriptions: [{ type: 'artifact_type', artifactType: 'api_contract' }],
    },
    ...overrides,
  };
}

function makeTemplateInput(projectId: string): CreateTeamTemplateInput {
  return {
    projectId,
    name: 'Page Development Team',
    roles: [makeRoleCard()],
    defaultWorkflow: {
      phases: ['clarify', 'plan', 'foundation', 'design', 'implementation', 'review', 'fix', 'deliver'],
      steps: [
        {
          id: 'step_implementation',
          phase: 'implementation',
          title: 'Implement page',
          roleKeys: ['frontend'],
        },
      ],
    },
    roomBusPolicy: {
      allowedActions: ['ask_agent', 'answer_agent', 'request_review', 'review_result', 'artifact_update'],
      maxRequestsPerAgentTurn: 3,
      defaultTtlMs: 24 * 60 * 60 * 1000,
      maxHops: 4,
    },
  };
}

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  const now = Date.now();
  return {
    id: 'artifact_design_tokens',
    name: 'design-tokens.json',
    type: 'design_tokens',
    scope: 'project',
    version: 1,
    status: 'approved',
    tags: ['design'],
    contentRef: 'project/design-tokens.json',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('native agent room storage: P0', () => {
  it('persists projects, team templates, and rooms', () => {
    const workspaceRoot = makeWorkspaceRoot();

    const project = createProject(workspaceRoot, {
      name: 'Acme SaaS Website',
      artifacts: [makeArtifact()],
    });
    const template = createTeamTemplate(workspaceRoot, makeTemplateInput(project.id));
    const room = createRoomRecord(workspaceRoot, {
      projectId: project.id,
      templateId: template.id,
      name: 'Pricing Page Room',
      goal: 'Develop SaaS pricing page',
      roleCards: template.roles,
    });

    expect(loadProject(workspaceRoot, project.id)?.name).toBe('Acme SaaS Website');
    expect(loadTeamTemplate(workspaceRoot, template.id)?.roles).toHaveLength(1);
    expect(loadRoom(workspaceRoot, room.id)?.goal).toBe('Develop SaaS pricing page');
    expect(listProjects(workspaceRoot)).toHaveLength(1);
    expect(listTeamTemplates(workspaceRoot, project.id)).toHaveLength(1);
    expect(listRooms(workspaceRoot, project.id)).toHaveLength(1);

    const reloadedProject = loadProject(workspaceRoot, project.id);
    expect(reloadedProject?.teamTemplateIds).toEqual([template.id]);
    expect(reloadedProject?.roomIds).toEqual([room.id]);
  });

  it('lets a room reference project-level artifacts', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const project = createProject(workspaceRoot, { name: 'Acme SaaS Website' });
    const designTokens = makeArtifact();
    const componentGuidelines = makeArtifact({
      id: 'artifact_component_guidelines',
      name: 'component-guidelines.md',
      type: 'component_guidelines',
      contentRef: 'project/component-guidelines.md',
    });
    addProjectArtifact(workspaceRoot, project.id, designTokens);
    addProjectArtifact(workspaceRoot, project.id, componentGuidelines);

    const room = createRoomRecord(workspaceRoot, {
      projectId: project.id,
      name: 'Pricing Page Room',
      goal: 'Develop SaaS pricing page',
    });

    const artifacts = listRoomAvailableArtifacts(workspaceRoot, room.id);
    expect(artifacts.projectArtifacts.map((artifact) => artifact.name).sort()).toEqual([
      'component-guidelines.md',
      'design-tokens.json',
    ]);
    expect(artifacts.roomArtifacts).toEqual([]);
    expect(artifacts.taskArtifacts).toEqual([]);
  });

  it('excludes deprecated project artifacts from available room artifacts', () => {
    const workspaceRoot = makeWorkspaceRoot();
    const project = createProject(workspaceRoot, {
      name: 'Acme SaaS Website',
      artifacts: [
        makeArtifact(),
        makeArtifact({
          id: 'artifact_old_tokens',
          name: 'old-design-tokens.json',
          status: 'deprecated',
          contentRef: 'project/old-design-tokens.json',
        }),
      ],
    });
    const room = createRoomRecord(workspaceRoot, {
      projectId: project.id,
      name: 'Pricing Page Room',
      goal: 'Develop SaaS pricing page',
    });

    const artifacts = listRoomAvailableArtifacts(workspaceRoot, room.id);
    expect(artifacts.projectArtifacts.map((artifact) => artifact.name)).toEqual(['design-tokens.json']);
  });
});
