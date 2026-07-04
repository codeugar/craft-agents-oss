import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProject, loadRoom, loadTeamTemplate } from '../storage.ts';
import {
  createAgentDefinition,
  deleteAgentDefinition,
  listAgentDefinitions,
  loadAgentDefinition,
  roleCardFromAgentDefinition,
  updateAgentDefinition,
} from '../agent-library.ts';
import {
  addAgentToRoom,
  createRoomFromTemplate,
  createRoomWithAgents,
  createTeamTemplateFromAgents,
  saveRoomAsTeamTemplate,
  updateRoomRolePrompt,
} from '../room-operations.ts';
import type { CreateAgentDefinitionInput } from '../types.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeWorkspaceRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'native-agent-room-m1-'));
  tempDirs.push(dir);
  return dir;
}

function makeAgentInput(roleKey: string, name: string): CreateAgentDefinitionInput {
  return {
    name,
    roleKey,
    mission: `${name} mission`,
    prompt: `${name} prompt v1`,
    responsibilities: [`${name} responsibility`],
    allowedActions: ['ask_agent', 'answer_agent', 'request_review', 'review_result', 'artifact_update'],
  };
}

describe('agent library CRUD', () => {
  it('creates, loads, and lists agent definitions with defaults', async () => {
    const root = makeWorkspaceRoot();

    const frontend = createAgentDefinition(root, makeAgentInput('frontend', 'Frontend Engineer'));
    // creation timestamps order the list; keep the two creations in distinct ms
    await new Promise((resolve) => setTimeout(resolve, 2));
    const backend = createAgentDefinition(root, {
      name: 'Backend API Designer',
      roleKey: 'backend',
      prompt: 'Backend prompt v1',
    });

    expect(frontend.id).toStartWith('agentdef_');
    expect(frontend.name).toBe('Frontend Engineer');
    expect(frontend.prompt).toBe('Frontend Engineer prompt v1');
    expect(frontend.createdAt).toBeGreaterThan(0);

    // omitted fields fall back to safe defaults
    expect(backend.mission).toBe('');
    expect(backend.responsibilities).toEqual([]);
    expect(backend.forbiddenActions).toEqual([]);
    expect(backend.allowedActions.length).toBeGreaterThan(0);
    expect(backend.contextPolicy.exclude).toContain('full_transcript');

    const loaded = loadAgentDefinition(root, frontend.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('Frontend Engineer');

    const all = listAgentDefinitions(root);
    expect(all.map((item) => item.id)).toEqual([frontend.id, backend.id]);
  });

  it('updates an agent definition in place and bumps updatedAt', async () => {
    const root = makeWorkspaceRoot();
    const agent = createAgentDefinition(root, makeAgentInput('qa', 'QA Tester'));

    await new Promise((resolve) => setTimeout(resolve, 2));
    const updated = updateAgentDefinition(root, agent.id, {
      prompt: 'QA prompt v2',
      description: 'Reviews implementation quality',
    });

    expect(updated.id).toBe(agent.id);
    expect(updated.prompt).toBe('QA prompt v2');
    expect(updated.description).toBe('Reviews implementation quality');
    expect(updated.roleKey).toBe('qa');
    expect(updated.createdAt).toBe(agent.createdAt);
    expect(updated.updatedAt).toBeGreaterThan(agent.updatedAt);

    const reloaded = loadAgentDefinition(root, agent.id);
    expect(reloaded!.prompt).toBe('QA prompt v2');
  });

  it('deletes an agent definition', () => {
    const root = makeWorkspaceRoot();
    const agent = createAgentDefinition(root, makeAgentInput('seo', 'SEO Agent'));

    deleteAgentDefinition(root, agent.id);

    expect(loadAgentDefinition(root, agent.id)).toBeNull();
    expect(listAgentDefinitions(root)).toEqual([]);
  });

  it('throws when updating a missing agent definition', () => {
    const root = makeWorkspaceRoot();
    expect(() => updateAgentDefinition(root, 'agentdef_missing', { prompt: 'x' })).toThrow();
  });

  it('snapshots an agent definition into a role card with provenance', () => {
    const root = makeWorkspaceRoot();
    const agent = createAgentDefinition(root, makeAgentInput('frontend', 'Frontend Engineer'));

    const role = roleCardFromAgentDefinition(agent);

    expect(role.id).not.toBe(agent.id);
    expect(role.agentDefinitionId).toBe(agent.id);
    expect(role.name).toBe(agent.name);
    expect(role.roleKey).toBe(agent.roleKey);
    expect(role.prompt).toBe(agent.prompt);
    expect(role.contextPolicy).toEqual(agent.contextPolicy);

    // snapshot must be a deep copy, not a shared reference
    role.contextPolicy.requiredArtifactTypes.push('ui_spec');
    expect(agent.contextPolicy.requiredArtifactTypes).toEqual([]);
  });
});

describe('rooms built from the agent library', () => {
  it('creates a room directly from agent definitions', () => {
    const root = makeWorkspaceRoot();
    const project = createProject(root, { name: 'Acme SaaS Website' });
    const frontend = createAgentDefinition(root, makeAgentInput('frontend', 'Frontend Engineer'));
    const backend = createAgentDefinition(root, makeAgentInput('backend', 'Backend API Designer'));

    const room = createRoomWithAgents(root, {
      projectId: project.id,
      name: 'Pricing Page Room',
      goal: 'Build the pricing page',
      agentDefinitionIds: [frontend.id, backend.id],
    });

    expect(room.members).toHaveLength(2);
    expect(room.roleCards).toHaveLength(2);
    expect(room.inboxes).toHaveLength(2);
    expect(room.roomBusPolicy).toBeDefined();

    const frontendRole = room.roleCards.find((role) => role.roleKey === 'frontend')!;
    expect(frontendRole.agentDefinitionId).toBe(frontend.id);
    const frontendMember = room.members.find((member) => member.roleKey === 'frontend')!;
    expect(frontendMember.roleCardId).toBe(frontendRole.id);
    expect(room.inboxes.some((inbox) => inbox.agentId === frontendMember.id)).toBe(true);
  });

  it('throws when creating a room with an unknown agent definition', () => {
    const root = makeWorkspaceRoot();
    const project = createProject(root, { name: 'Acme SaaS Website' });

    expect(() =>
      createRoomWithAgents(root, {
        projectId: project.id,
        name: 'Broken Room',
        goal: 'Should fail',
        agentDefinitionIds: ['agentdef_missing'],
      })
    ).toThrow();
  });

  it('adds an agent from the library to an existing room', () => {
    const root = makeWorkspaceRoot();
    const project = createProject(root, { name: 'Acme SaaS Website' });
    const frontend = createAgentDefinition(root, makeAgentInput('frontend', 'Frontend Engineer'));
    const qa = createAgentDefinition(root, makeAgentInput('qa', 'QA Tester'));

    const room = createRoomWithAgents(root, {
      projectId: project.id,
      name: 'Pricing Page Room',
      goal: 'Build the pricing page',
      agentDefinitionIds: [frontend.id],
    });

    const { room: updatedRoom, member } = addAgentToRoom(root, {
      roomId: room.id,
      agentDefinitionId: qa.id,
    });

    expect(updatedRoom.members).toHaveLength(2);
    expect(member.roleKey).toBe('qa');
    const qaRole = updatedRoom.roleCards.find((role) => role.id === member.roleCardId)!;
    expect(qaRole.agentDefinitionId).toBe(qa.id);
    expect(updatedRoom.inboxes.some((inbox) => inbox.agentId === member.id)).toBe(true);

    expect(() => addAgentToRoom(root, { roomId: room.id, agentDefinitionId: 'agentdef_missing' })).toThrow();
  });

  it('editing the library after room creation does not change existing rooms', () => {
    const root = makeWorkspaceRoot();
    const project = createProject(root, { name: 'Acme SaaS Website' });
    const frontend = createAgentDefinition(root, makeAgentInput('frontend', 'Frontend Engineer'));

    const room = createRoomWithAgents(root, {
      projectId: project.id,
      name: 'Pricing Page Room',
      goal: 'Build the pricing page',
      agentDefinitionIds: [frontend.id],
    });

    updateAgentDefinition(root, frontend.id, { prompt: 'Frontend prompt v2' });

    const reloaded = loadRoom(root, room.id)!;
    expect(reloaded.roleCards[0]!.prompt).toBe('Frontend Engineer prompt v1');
  });

  it('room-level prompt overrides do not write back to the library', () => {
    const root = makeWorkspaceRoot();
    const project = createProject(root, { name: 'Acme SaaS Website' });
    const frontend = createAgentDefinition(root, makeAgentInput('frontend', 'Frontend Engineer'));

    const room = createRoomWithAgents(root, {
      projectId: project.id,
      name: 'Pricing Page Room',
      goal: 'Build the pricing page',
      agentDefinitionIds: [frontend.id],
    });

    const roleCardId = room.roleCards[0]!.id;
    const updatedRoom = updateRoomRolePrompt(root, room.id, roleCardId, 'Room-specific override');

    expect(updatedRoom.roleCards[0]!.prompt).toBe('Room-specific override');
    expect(loadAgentDefinition(root, frontend.id)!.prompt).toBe('Frontend Engineer prompt v1');
  });
});

describe('team templates as agent combinations', () => {
  it('creates a team template from agent definitions with provenance', () => {
    const root = makeWorkspaceRoot();
    const project = createProject(root, { name: 'Acme SaaS Website' });
    const frontend = createAgentDefinition(root, makeAgentInput('frontend', 'Frontend Engineer'));
    const backend = createAgentDefinition(root, makeAgentInput('backend', 'Backend API Designer'));

    const template = createTeamTemplateFromAgents(root, {
      projectId: project.id,
      name: 'Page Development Team',
      agentDefinitionIds: [frontend.id, backend.id],
    });

    expect(template.roles).toHaveLength(2);
    expect(template.roles[0]!.agentDefinitionId).toBe(frontend.id);
    expect(template.roles[1]!.agentDefinitionId).toBe(backend.id);
    expect(loadTeamTemplate(root, template.id)).not.toBeNull();
  });

  it('room creation from a template resolves the current library version first', () => {
    const root = makeWorkspaceRoot();
    const project = createProject(root, { name: 'Acme SaaS Website' });
    const frontend = createAgentDefinition(root, makeAgentInput('frontend', 'Frontend Engineer'));

    const template = createTeamTemplateFromAgents(root, {
      projectId: project.id,
      name: 'Page Development Team',
      agentDefinitionIds: [frontend.id],
    });

    updateAgentDefinition(root, frontend.id, { prompt: 'Frontend prompt v2' });

    const room = createRoomFromTemplate(root, {
      projectId: project.id,
      templateId: template.id,
      name: 'Pricing Page Room',
      goal: 'Build the pricing page',
    });

    expect(room.roleCards[0]!.prompt).toBe('Frontend prompt v2');
    expect(room.roleCards[0]!.agentDefinitionId).toBe(frontend.id);
  });

  it('falls back to the template snapshot when the library agent is deleted', () => {
    const root = makeWorkspaceRoot();
    const project = createProject(root, { name: 'Acme SaaS Website' });
    const frontend = createAgentDefinition(root, makeAgentInput('frontend', 'Frontend Engineer'));

    const template = createTeamTemplateFromAgents(root, {
      projectId: project.id,
      name: 'Page Development Team',
      agentDefinitionIds: [frontend.id],
    });

    deleteAgentDefinition(root, frontend.id);

    const room = createRoomFromTemplate(root, {
      projectId: project.id,
      templateId: template.id,
      name: 'Pricing Page Room',
      goal: 'Build the pricing page',
    });

    expect(room.roleCards[0]!.prompt).toBe('Frontend Engineer prompt v1');
    expect(room.members).toHaveLength(1);
  });

  it('saving a room as a template preserves agent provenance', () => {
    const root = makeWorkspaceRoot();
    const project = createProject(root, { name: 'Acme SaaS Website' });
    const frontend = createAgentDefinition(root, makeAgentInput('frontend', 'Frontend Engineer'));

    const room = createRoomWithAgents(root, {
      projectId: project.id,
      name: 'Pricing Page Room',
      goal: 'Build the pricing page',
      agentDefinitionIds: [frontend.id],
    });

    const template = saveRoomAsTeamTemplate(root, {
      roomId: room.id,
      name: 'Saved Page Team',
    });

    expect(template.roles[0]!.agentDefinitionId).toBe(frontend.id);
  });

  it('persists agent definitions under the native-agent-room directory', () => {
    const root = makeWorkspaceRoot();
    const agent = createAgentDefinition(root, makeAgentInput('frontend', 'Frontend Engineer'));

    expect(existsSync(join(root, 'native-agent-room', 'agents', `${agent.id}.json`))).toBe(true);
  });
});
