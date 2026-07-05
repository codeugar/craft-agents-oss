import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createProject, loadRoom } from '../storage.ts';
import { createAgentDefinition } from '../agent-library.ts';
import { createRoomWithAgents, setRoomModel } from '../room-operations.ts';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function makeRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nar-model-'));
  tempDirs.push(dir);
  return dir;
}
function setup(root: string) {
  const project = createProject(root, { name: 'P' });
  const agent = createAgentDefinition(root, { name: 'FE', roleKey: 'frontend', prompt: 'You are FE.' });
  return { projectId: project.id, agentId: agent.id };
}

describe('per-room model config', () => {
  it('createRoomWithAgents persists llmConnectionSlug and model when provided', () => {
    const root = makeRoot();
    const { projectId, agentId } = setup(root);
    const room = createRoomWithAgents(root, {
      projectId,
      name: 'R',
      goal: 'g',
      agentDefinitionIds: [agentId],
      llmConnectionSlug: 'anthropic-default',
      model: 'claude-fable-5',
    });
    expect(room.llmConnectionSlug).toBe('anthropic-default');
    expect(room.model).toBe('claude-fable-5');
    expect(loadRoom(root, room.id)!.model).toBe('claude-fable-5');
  });

  it('leaves model config undefined when not provided (falls back to workspace default at run time)', () => {
    const root = makeRoot();
    const { projectId, agentId } = setup(root);
    const room = createRoomWithAgents(root, { projectId, name: 'R', goal: 'g', agentDefinitionIds: [agentId] });
    expect(room.llmConnectionSlug).toBeUndefined();
    expect(room.model).toBeUndefined();
  });

  it('setRoomModel updates connection + model and can clear them', () => {
    const root = makeRoot();
    const { projectId, agentId } = setup(root);
    const room = createRoomWithAgents(root, { projectId, name: 'R', goal: 'g', agentDefinitionIds: [agentId] });

    const updated = setRoomModel(root, room.id, { llmConnectionSlug: 'pi-codex', model: 'gpt-5.5' });
    expect(updated.llmConnectionSlug).toBe('pi-codex');
    expect(updated.model).toBe('gpt-5.5');
    expect(loadRoom(root, room.id)!.model).toBe('gpt-5.5');

    const cleared = setRoomModel(root, room.id, { llmConnectionSlug: undefined, model: undefined });
    expect(cleared.llmConnectionSlug).toBeUndefined();
    expect(cleared.model).toBeUndefined();
  });

  it('setRoomModel throws for a missing room', () => {
    const root = makeRoot();
    expect(() => setRoomModel(root, 'room_missing', { model: 'x' })).toThrow();
  });
});
