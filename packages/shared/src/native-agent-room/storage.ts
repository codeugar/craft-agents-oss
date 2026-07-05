import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { atomicWriteFileSync, readJsonFileSync } from '../utils/files.ts';
import type {
  Artifact,
  CreateProjectInput,
  CreateRoomRecordInput,
  CreateTeamTemplateInput,
  Project,
  Room,
  RoomAvailableArtifacts,
  TeamTemplate,
} from './types.ts';

const NATIVE_AGENT_ROOM_DIR = 'native-agent-room';
const PROJECTS_DIR = 'projects';
const TEAM_TEMPLATES_DIR = 'team-templates';
const ROOMS_DIR = 'rooms';
const AGENTS_DIR = 'agents';

export function createNativeAgentRoomId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function assertSafeId(id: string): void {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid Native Agent Room id: ${id}`);
  }
}

function readJsonOrNull<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return readJsonFileSync<T>(path);
  } catch {
    return null;
  }
}

function writeJson(path: string, value: unknown): void {
  atomicWriteFileSync(path, JSON.stringify(value, null, 2));
}

function listJsonFiles<T>(dir: string): T[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readJsonOrNull<T>(join(dir, entry.name)))
    .filter((item): item is T => item !== null);
}

export function getNativeAgentRoomPath(workspaceRootPath: string): string {
  return join(workspaceRootPath, NATIVE_AGENT_ROOM_DIR);
}

export function getNativeAgentRoomProjectsPath(workspaceRootPath: string): string {
  return join(getNativeAgentRoomPath(workspaceRootPath), PROJECTS_DIR);
}

export function getNativeAgentRoomTeamTemplatesPath(workspaceRootPath: string): string {
  return join(getNativeAgentRoomPath(workspaceRootPath), TEAM_TEMPLATES_DIR);
}

export function getNativeAgentRoomRoomsPath(workspaceRootPath: string): string {
  return join(getNativeAgentRoomPath(workspaceRootPath), ROOMS_DIR);
}

export function getNativeAgentRoomAgentsPath(workspaceRootPath: string): string {
  return join(getNativeAgentRoomPath(workspaceRootPath), AGENTS_DIR);
}

export function ensureNativeAgentRoomDir(workspaceRootPath: string): string {
  const root = getNativeAgentRoomPath(workspaceRootPath);
  mkdirSync(getNativeAgentRoomProjectsPath(workspaceRootPath), { recursive: true });
  mkdirSync(getNativeAgentRoomTeamTemplatesPath(workspaceRootPath), { recursive: true });
  mkdirSync(getNativeAgentRoomRoomsPath(workspaceRootPath), { recursive: true });
  mkdirSync(getNativeAgentRoomAgentsPath(workspaceRootPath), { recursive: true });
  return root;
}

export function getProjectPath(workspaceRootPath: string, projectId: string): string {
  assertSafeId(projectId);
  return join(getNativeAgentRoomProjectsPath(workspaceRootPath), `${projectId}.json`);
}

export function getTeamTemplatePath(workspaceRootPath: string, templateId: string): string {
  assertSafeId(templateId);
  return join(getNativeAgentRoomTeamTemplatesPath(workspaceRootPath), `${templateId}.json`);
}

export function getRoomPath(workspaceRootPath: string, roomId: string): string {
  assertSafeId(roomId);
  return join(getNativeAgentRoomRoomsPath(workspaceRootPath), `${roomId}.json`);
}

export function createProject(workspaceRootPath: string, input: CreateProjectInput): Project {
  ensureNativeAgentRoomDir(workspaceRootPath);

  const now = Date.now();
  const projectId = createNativeAgentRoomId('project');
  const artifacts = (input.artifacts ?? []).map((artifact) => ({
    ...artifact,
    projectId,
    scope: 'project' as const,
    updatedAt: artifact.updatedAt ?? now,
    createdAt: artifact.createdAt ?? now,
  }));

  const project: Project = {
    id: projectId,
    name: input.name,
    description: input.description,
    artifacts,
    teamTemplateIds: [],
    roomIds: [],
    createdAt: now,
    updatedAt: now,
  };

  saveProject(workspaceRootPath, project);
  return project;
}

export function saveProject(workspaceRootPath: string, project: Project): void {
  ensureNativeAgentRoomDir(workspaceRootPath);
  writeJson(getProjectPath(workspaceRootPath, project.id), {
    ...project,
    updatedAt: Date.now(),
  });
}

export function loadProject(workspaceRootPath: string, projectId: string): Project | null {
  return readJsonOrNull<Project>(getProjectPath(workspaceRootPath, projectId));
}

export function listProjects(workspaceRootPath: string): Project[] {
  return listJsonFiles<Project>(getNativeAgentRoomProjectsPath(workspaceRootPath))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function deleteProject(workspaceRootPath: string, projectId: string): void {
  const project = loadProject(workspaceRootPath, projectId);
  if (!project) return;

  for (const roomId of project.roomIds) {
    deleteRoom(workspaceRootPath, roomId);
  }

  for (const templateId of project.teamTemplateIds) {
    deleteTeamTemplate(workspaceRootPath, templateId);
  }

  rmSync(getProjectPath(workspaceRootPath, projectId), { force: true });
}

export function addProjectArtifact(workspaceRootPath: string, projectId: string, artifact: Artifact): Project {
  const project = loadProject(workspaceRootPath, projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const now = Date.now();
  const nextArtifact: Artifact = {
    ...artifact,
    projectId,
    scope: 'project',
    createdAt: artifact.createdAt ?? now,
    updatedAt: artifact.updatedAt ?? now,
  };

  project.artifacts = [
    ...project.artifacts.filter((item) => item.id !== nextArtifact.id),
    nextArtifact,
  ];
  saveProject(workspaceRootPath, project);
  return loadProject(workspaceRootPath, projectId)!;
}

export function createTeamTemplate(workspaceRootPath: string, input: CreateTeamTemplateInput): TeamTemplate {
  ensureNativeAgentRoomDir(workspaceRootPath);

  if (input.projectId && !loadProject(workspaceRootPath, input.projectId)) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const now = Date.now();
  const template: TeamTemplate = {
    id: createNativeAgentRoomId('template'),
    projectId: input.projectId,
    name: input.name,
    description: input.description,
    roles: input.roles,
    defaultWorkflow: input.defaultWorkflow,
    roomBusPolicy: input.roomBusPolicy,
    createdAt: now,
    updatedAt: now,
  };

  saveTeamTemplate(workspaceRootPath, template);

  if (template.projectId) {
    const project = loadProject(workspaceRootPath, template.projectId)!;
    if (!project.teamTemplateIds.includes(template.id)) {
      project.teamTemplateIds.push(template.id);
      saveProject(workspaceRootPath, project);
    }
  }

  return template;
}

export function saveTeamTemplate(workspaceRootPath: string, template: TeamTemplate): void {
  ensureNativeAgentRoomDir(workspaceRootPath);
  writeJson(getTeamTemplatePath(workspaceRootPath, template.id), {
    ...template,
    updatedAt: Date.now(),
  });
}

export function loadTeamTemplate(workspaceRootPath: string, templateId: string): TeamTemplate | null {
  return readJsonOrNull<TeamTemplate>(getTeamTemplatePath(workspaceRootPath, templateId));
}

export function listTeamTemplates(workspaceRootPath: string, projectId?: string): TeamTemplate[] {
  return listJsonFiles<TeamTemplate>(getNativeAgentRoomTeamTemplatesPath(workspaceRootPath))
    .filter((template) => !projectId || template.projectId === projectId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function deleteTeamTemplate(workspaceRootPath: string, templateId: string): void {
  const template = loadTeamTemplate(workspaceRootPath, templateId);
  if (template?.projectId) {
    const project = loadProject(workspaceRootPath, template.projectId);
    if (project) {
      project.teamTemplateIds = project.teamTemplateIds.filter((id) => id !== templateId);
      saveProject(workspaceRootPath, project);
    }
  }

  rmSync(getTeamTemplatePath(workspaceRootPath, templateId), { force: true });
}

export function createRoomRecord(workspaceRootPath: string, input: CreateRoomRecordInput): Room {
  ensureNativeAgentRoomDir(workspaceRootPath);

  const project = loadProject(workspaceRootPath, input.projectId);
  if (!project) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  if (input.templateId && !loadTeamTemplate(workspaceRootPath, input.templateId)) {
    throw new Error(`Team template not found: ${input.templateId}`);
  }

  const now = Date.now();
  const room: Room = {
    id: createNativeAgentRoomId('room'),
    projectId: input.projectId,
    templateId: input.templateId,
    name: input.name,
    goal: input.goal,
    status: input.status ?? 'draft',
    phase: input.phase ?? 'clarify',
    workflow: input.workflow,
    roomBusPolicy: input.roomBusPolicy,
    llmConnectionSlug: input.llmConnectionSlug,
    model: input.model,
    roleCards: input.roleCards ?? [],
    members: input.members ?? [],
    tasks: input.tasks ?? [],
    artifacts: input.artifacts ?? [],
    decisions: input.decisions ?? [],
    events: input.events ?? [],
    inboxes: input.inboxes ?? [],
    timeline: input.timeline ?? [],
    createdAt: now,
    updatedAt: now,
  };

  saveRoom(workspaceRootPath, room);

  if (!project.roomIds.includes(room.id)) {
    project.roomIds.push(room.id);
    saveProject(workspaceRootPath, project);
  }

  return room;
}

export function saveRoom(workspaceRootPath: string, room: Room): void {
  ensureNativeAgentRoomDir(workspaceRootPath);
  writeJson(getRoomPath(workspaceRootPath, room.id), {
    ...room,
    updatedAt: Date.now(),
  });
}

export function loadRoom(workspaceRootPath: string, roomId: string): Room | null {
  return readJsonOrNull<Room>(getRoomPath(workspaceRootPath, roomId));
}

export function listRooms(workspaceRootPath: string, projectId?: string): Room[] {
  return listJsonFiles<Room>(getNativeAgentRoomRoomsPath(workspaceRootPath))
    .filter((room) => !projectId || room.projectId === projectId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function deleteRoom(workspaceRootPath: string, roomId: string): void {
  const room = loadRoom(workspaceRootPath, roomId);
  if (room) {
    const project = loadProject(workspaceRootPath, room.projectId);
    if (project) {
      project.roomIds = project.roomIds.filter((id) => id !== roomId);
      saveProject(workspaceRootPath, project);
    }
  }

  rmSync(getRoomPath(workspaceRootPath, roomId), { force: true });
}

export function listRoomAvailableArtifacts(workspaceRootPath: string, roomId: string): RoomAvailableArtifacts {
  const room = loadRoom(workspaceRootPath, roomId);
  if (!room) {
    throw new Error(`Room not found: ${roomId}`);
  }

  const project = loadProject(workspaceRootPath, room.projectId);
  const projectArtifacts = project?.artifacts.filter((artifact) => artifact.status !== 'deprecated') ?? [];
  const roomArtifacts = room.artifacts.filter((artifact) =>
    artifact.scope === 'room' && artifact.status !== 'deprecated'
  );
  const taskArtifacts = room.artifacts.filter((artifact) =>
    artifact.scope === 'task' && artifact.status !== 'deprecated'
  );

  return {
    projectArtifacts,
    roomArtifacts,
    taskArtifacts,
  };
}
