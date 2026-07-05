import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProject, loadRoom } from '../storage.ts';
import { createAgentDefinition } from '../agent-library.ts';
import { createRoomWithAgents } from '../room-operations.ts';
import { publishRoomBusEvent } from '../room-bus.ts';
import { upsertRoomArtifact } from '../artifact-ops.ts';
import { refreshRoomTimeline } from '../timeline-ops.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeWorkspaceRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'native-agent-room-p5-'));
  tempDirs.push(dir);
  return dir;
}

function setup(root: string) {
  const project = createProject(root, { name: 'Acme SaaS Website' });
  const frontend = createAgentDefinition(root, {
    name: 'Frontend Agent',
    roleKey: 'frontend',
    prompt: 'You are the frontend agent.',
    allowedActions: ['ask_agent', 'answer_agent', 'raise_blocker', 'artifact_update'],
  });
  const backend = createAgentDefinition(root, {
    name: 'Backend API Agent',
    roleKey: 'backend',
    prompt: 'You are the backend agent.',
  });
  const room = createRoomWithAgents(root, {
    projectId: project.id,
    name: 'Pricing Page Room',
    goal: 'Build the pricing page',
    agentDefinitionIds: [frontend.id, backend.id],
  });
  return {
    room,
    frontend: room.members.find((m) => m.roleKey === 'frontend')!,
    backend: room.members.find((m) => m.roleKey === 'backend')!,
  };
}

describe('refreshRoomTimeline', () => {
  it('derives timeline items from significant events with source references', () => {
    const root = makeWorkspaceRoot();
    const { room, frontend, backend } = setup(root);

    publishRoomBusEvent(root, {
      roomId: room.id,
      from: frontend.id,
      to: [{ type: 'agent', id: backend.id }],
      type: 'ask_agent',
      payload: { message: 'Need the API contract.', expectedOutput: 'API contract' },
    });
    const { artifact, event: artifactEvent } = upsertRoomArtifact(root, {
      roomId: room.id,
      name: 'api-contract-pricing.json',
      type: 'api_contract',
      contentRef: 'ref-v1',
      ownerAgentId: backend.id,
      message: 'Initial contract',
    });
    publishRoomBusEvent(root, {
      roomId: room.id,
      from: frontend.id,
      to: [{ type: 'agent', id: backend.id }],
      type: 'raise_blocker',
      payload: { message: 'Mobile overflow blocks release.' },
    });

    const timeline = refreshRoomTimeline(root, room.id);

    // artifact update is a milestone with artifact + event references
    const artifactItem = timeline.find((item) => item.sourceArtifactIds.includes(artifact.id))!;
    expect(artifactItem).toBeDefined();
    expect(artifactItem.title).toContain('api-contract-pricing.json');
    expect(artifactItem.title).toContain('v1');
    expect(artifactItem.sourceEventIds).toContain(artifactEvent!.id);

    // blocker is a milestone; plain ask_agent chatter is not
    expect(timeline.some((item) => item.title.toLowerCase().includes('blocker'))).toBe(true);

    // persisted on the room
    const reloaded = loadRoom(root, room.id)!;
    expect(reloaded.timeline.length).toBe(timeline.length);
  });

  it('is idempotent: rebuilding does not duplicate items', () => {
    const root = makeWorkspaceRoot();
    const { room, backend } = setup(root);

    upsertRoomArtifact(root, {
      roomId: room.id,
      name: 'ui-spec.md',
      type: 'ui_spec',
      contentRef: 'ref',
      ownerAgentId: backend.id,
    });

    const first = refreshRoomTimeline(root, room.id);
    const second = refreshRoomTimeline(root, room.id);

    expect(second.length).toBe(first.length);
    expect(second.map((item) => item.id)).toEqual(first.map((item) => item.id));
  });
});
