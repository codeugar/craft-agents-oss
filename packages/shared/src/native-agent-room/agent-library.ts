import { existsSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { atomicWriteFileSync, readJsonFileSync } from '../utils/files.ts';
import {
  createNativeAgentRoomId,
  ensureNativeAgentRoomDir,
  getNativeAgentRoomAgentsPath,
} from './storage.ts';
import type {
  AgentDefinition,
  ContextPolicy,
  CreateAgentDefinitionInput,
  RoleCard,
  UpdateAgentDefinitionInput,
} from './types.ts';

const DEFAULT_ALLOWED_ACTIONS: AgentDefinition['allowedActions'] = [
  'ask_agent',
  'answer_agent',
  'request_review',
  'review_result',
  'artifact_update',
  'announcement',
];

function defaultContextPolicy(): ContextPolicy {
  return {
    alwaysInclude: [
      'role_contract',
      'member_directory',
      'current_task',
      'required_artifacts',
      'direct_mentions',
      'assigned_room_bus_events',
      'relevant_decisions',
      'room_timeline',
    ],
    requiredArtifactTypes: [],
    optionalArtifactTypes: [],
    includeEvents: ['ask_agent', 'answer_agent', 'artifact_update', 'announcement'],
    exclude: [
      'full_transcript',
      'other_agents_private_memory',
      'unrelated_messages',
      'unrelated_rooms',
      'deprecated_artifacts',
      'rejected_decisions',
      'unrelated_resolved_events',
    ],
    subscriptions: [],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertSafeId(id: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid Native Agent Room id: ${id}`);
  }
}

export function getAgentDefinitionPath(workspaceRootPath: string, agentDefinitionId: string): string {
  assertSafeId(agentDefinitionId);
  return join(getNativeAgentRoomAgentsPath(workspaceRootPath), `${agentDefinitionId}.json`);
}

export function createAgentDefinition(
  workspaceRootPath: string,
  input: CreateAgentDefinitionInput
): AgentDefinition {
  ensureNativeAgentRoomDir(workspaceRootPath);

  const now = Date.now();
  const definition: AgentDefinition = {
    id: createNativeAgentRoomId('agentdef'),
    name: input.name,
    description: input.description,
    roleKey: input.roleKey,
    mission: input.mission ?? '',
    prompt: input.prompt,
    responsibilities: input.responsibilities ?? [],
    inputs: input.inputs ?? [],
    outputs: input.outputs ?? [],
    allowedActions: input.allowedActions ?? [...DEFAULT_ALLOWED_ACTIONS],
    forbiddenActions: input.forbiddenActions ?? [],
    doneCriteria: input.doneCriteria ?? [],
    contextPolicy: input.contextPolicy ?? defaultContextPolicy(),
    createdAt: now,
    updatedAt: now,
  };

  saveAgentDefinition(workspaceRootPath, definition);
  return definition;
}

export function saveAgentDefinition(workspaceRootPath: string, definition: AgentDefinition): void {
  ensureNativeAgentRoomDir(workspaceRootPath);
  atomicWriteFileSync(
    getAgentDefinitionPath(workspaceRootPath, definition.id),
    JSON.stringify(definition, null, 2)
  );
}

export function loadAgentDefinition(
  workspaceRootPath: string,
  agentDefinitionId: string
): AgentDefinition | null {
  const path = getAgentDefinitionPath(workspaceRootPath, agentDefinitionId);
  if (!existsSync(path)) return null;
  try {
    return readJsonFileSync<AgentDefinition>(path);
  } catch {
    return null;
  }
}

export function listAgentDefinitions(workspaceRootPath: string): AgentDefinition[] {
  const dir = getNativeAgentRoomAgentsPath(workspaceRootPath);
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      try {
        return readJsonFileSync<AgentDefinition>(join(dir, entry.name));
      } catch {
        return null;
      }
    })
    .filter((item): item is AgentDefinition => item !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function updateAgentDefinition(
  workspaceRootPath: string,
  agentDefinitionId: string,
  patch: UpdateAgentDefinitionInput
): AgentDefinition {
  const existing = loadAgentDefinition(workspaceRootPath, agentDefinitionId);
  if (!existing) {
    throw new Error(`Agent definition not found: ${agentDefinitionId}`);
  }

  const updated: AgentDefinition = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
  };

  saveAgentDefinition(workspaceRootPath, updated);
  return updated;
}

export function deleteAgentDefinition(workspaceRootPath: string, agentDefinitionId: string): void {
  rmSync(getAgentDefinitionPath(workspaceRootPath, agentDefinitionId), { force: true });
}

export function roleCardFromAgentDefinition(definition: AgentDefinition): RoleCard {
  return {
    id: createNativeAgentRoomId('role'),
    agentDefinitionId: definition.id,
    name: definition.name,
    roleKey: definition.roleKey,
    mission: definition.mission,
    prompt: definition.prompt,
    responsibilities: clone(definition.responsibilities),
    inputs: clone(definition.inputs),
    outputs: clone(definition.outputs),
    allowedActions: clone(definition.allowedActions),
    forbiddenActions: clone(definition.forbiddenActions),
    doneCriteria: clone(definition.doneCriteria),
    contextPolicy: clone(definition.contextPolicy),
  };
}
