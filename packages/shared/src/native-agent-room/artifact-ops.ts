import { createNativeAgentRoomId, loadRoom, saveRoom } from './storage.ts';
import { publishRoomBusEvent } from './room-bus.ts';
import type { Artifact, ArtifactType, RoomBusEvent } from './types.ts';

export interface UpsertRoomArtifactInput {
  roomId: string;
  name: string;
  type: ArtifactType;
  contentRef: string;
  ownerAgentId?: string;
  taskId?: string;
  status?: Artifact['status'];
  tags?: string[];
  /** Human-readable change note carried on the artifact_update event. */
  message?: string;
}

export interface UpsertRoomArtifactResult {
  artifact: Artifact;
  /** Null when the update has no audience (no owner and no dependent tasks). */
  event: RoomBusEvent | null;
}

export function upsertRoomArtifact(
  workspaceRootPath: string,
  input: UpsertRoomArtifactInput
): UpsertRoomArtifactResult {
  const room = loadRoom(workspaceRootPath, input.roomId);
  if (!room) {
    throw new Error(`Room not found: ${input.roomId}`);
  }

  const now = Date.now();
  const existing = room.artifacts.find(
    (item) => item.scope === 'room' && item.name === input.name
  );

  let artifact: Artifact;
  if (existing) {
    existing.version += 1;
    existing.type = input.type;
    existing.contentRef = input.contentRef;
    if (input.ownerAgentId !== undefined) existing.ownerAgentId = input.ownerAgentId;
    if (input.taskId !== undefined) existing.taskId = input.taskId;
    if (input.status !== undefined) existing.status = input.status;
    if (input.tags !== undefined) existing.tags = input.tags;
    existing.updatedAt = now;
    artifact = existing;
  } else {
    artifact = {
      id: createNativeAgentRoomId('artifact'),
      roomId: room.id,
      taskId: input.taskId,
      name: input.name,
      type: input.type,
      scope: 'room',
      ownerAgentId: input.ownerAgentId,
      version: 1,
      status: input.status ?? 'draft',
      tags: input.tags ?? [],
      contentRef: input.contentRef,
      createdAt: now,
      updatedAt: now,
    };
    room.artifacts.push(artifact);
  }

  saveRoom(workspaceRootPath, room);

  let event: RoomBusEvent | null = null;
  try {
    event = publishRoomBusEvent(workspaceRootPath, {
      roomId: room.id,
      from: input.ownerAgentId ?? 'system',
      type: 'artifact_update',
      artifactId: artifact.id,
      taskId: input.taskId,
      payload: {
        message: input.message ?? `${artifact.name} updated to v${artifact.version}`,
      },
    });
  } catch (error) {
    // An artifact with no owner and no dependent tasks has no audience; the
    // update is still persisted, it just produces no bus event.
    if (!(error instanceof Error && error.message.includes('resolvable target'))) {
      throw error;
    }
  }

  return { artifact: { ...artifact }, event };
}
