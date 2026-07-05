import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProject, loadRoom } from '../storage.ts';
import { createAgentDefinition } from '../agent-library.ts';
import { createRoomWithAgents } from '../room-operations.ts';
import { upsertRoomArtifact } from '../artifact-ops.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeWorkspaceRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'native-agent-room-p4-'));
  tempDirs.push(dir);
  return dir;
}

function setup(root: string) {
  const project = createProject(root, { name: 'Acme SaaS Website' });
  const backend = createAgentDefinition(root, {
    name: 'Backend API Agent',
    roleKey: 'backend',
    prompt: 'You are the backend agent.',
  });
  const room = createRoomWithAgents(root, {
    projectId: project.id,
    name: 'Pricing Page Room',
    goal: 'Build the pricing page',
    agentDefinitionIds: [backend.id],
  });
  return { project, room, member: room.members[0]! };
}

describe('upsertRoomArtifact', () => {
  it('creates a room artifact at version 1 and publishes artifact_update', () => {
    const root = makeWorkspaceRoot();
    const { room, member } = setup(root);

    const { artifact, event } = upsertRoomArtifact(root, {
      roomId: room.id,
      name: 'api-contract-pricing.json',
      type: 'api_contract',
      contentRef: 'artifacts/api-contract-pricing.json',
      ownerAgentId: member.id,
      message: 'Initial pricing API contract.',
    });

    expect(artifact.version).toBe(1);
    expect(artifact.scope).toBe('room');
    expect(artifact.status).toBe('draft');
    expect(event!.type).toBe('artifact_update');
    expect(event!.artifactId).toBe(artifact.id);

    const reloaded = loadRoom(root, room.id)!;
    expect(reloaded.artifacts).toHaveLength(1);
    expect(reloaded.events.some((item) => item.type === 'artifact_update')).toBe(true);
  });

  it('bumps the version when the same artifact name is upserted again', () => {
    const root = makeWorkspaceRoot();
    const { room, member } = setup(root);

    const first = upsertRoomArtifact(root, {
      roomId: room.id,
      name: 'api-contract-pricing.json',
      type: 'api_contract',
      contentRef: 'artifacts/api-contract-pricing.v1.json',
      ownerAgentId: member.id,
      message: 'v1',
    });
    const second = upsertRoomArtifact(root, {
      roomId: room.id,
      name: 'api-contract-pricing.json',
      type: 'api_contract',
      contentRef: 'artifacts/api-contract-pricing.v2.json',
      ownerAgentId: member.id,
      message: 'v2 adds yearlyPrice',
    });

    expect(second.artifact.id).toBe(first.artifact.id);
    expect(second.artifact.version).toBe(2);
    expect(second.artifact.contentRef).toBe('artifacts/api-contract-pricing.v2.json');

    const reloaded = loadRoom(root, room.id)!;
    expect(reloaded.artifacts).toHaveLength(1);
    expect(reloaded.artifacts[0]!.version).toBe(2);
  });

  it('routes the artifact_update into dependent task owners inboxes', async () => {
    const root = makeWorkspaceRoot();
    const { room, member } = setup(root);

    // a task owned by the member depends on the artifact by input reference after creation
    const first = upsertRoomArtifact(root, {
      roomId: room.id,
      name: 'api-contract-pricing.json',
      type: 'api_contract',
      contentRef: 'ref-v1',
      ownerAgentId: member.id,
      message: 'v1',
    });

    const withTask = loadRoom(root, room.id)!;
    withTask.tasks.push({
      id: 'task_impl',
      roomId: room.id,
      title: 'Implement Pricing Page',
      description: '',
      ownerAgentId: member.id,
      phase: 'implementation',
      status: 'in_progress',
      inputArtifactIds: [first.artifact.id],
      outputArtifactIds: [],
      dependencyTaskIds: [],
      doneCriteria: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const { saveRoom } = await import('../storage.ts');
    saveRoom(root, withTask);

    upsertRoomArtifact(root, {
      roomId: room.id,
      name: 'api-contract-pricing.json',
      type: 'api_contract',
      contentRef: 'ref-v2',
      ownerAgentId: member.id,
      message: 'v2',
    });

    const reloaded = loadRoom(root, room.id)!;
    const inbox = reloaded.inboxes.find((item) => item.agentId === member.id)!;
    expect(inbox.items.some((item) => item.type === 'artifact_update')).toBe(true);
  });
});
