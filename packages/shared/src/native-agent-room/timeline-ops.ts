import { loadRoom, saveRoom } from './storage.ts';
import type { Room, RoomBusEvent, TimelineItem } from './types.ts';

function payloadMessage(event: RoomBusEvent): string {
  return typeof event.payload.message === 'string' ? event.payload.message : '';
}

function milestoneTitle(room: Room, event: RoomBusEvent): string | null {
  if (event.type === 'artifact_update' && event.artifactId) {
    const artifact = room.artifacts.find((item) => item.id === event.artifactId);
    if (artifact) {
      return `${artifact.name} v${artifact.version} updated`;
    }
    return 'Artifact updated';
  }
  if (event.type === 'raise_blocker') {
    const message = payloadMessage(event);
    return message ? `Blocker raised: ${message}` : 'Blocker raised';
  }
  if (event.type === 'resolve_blocker') {
    return 'Blocker resolved';
  }
  if (event.type === 'decision') {
    const message = payloadMessage(event);
    return message ? `Decision: ${message}` : 'Decision recorded';
  }
  if (event.type === 'handoff_task') {
    return 'Task handed off';
  }
  if (event.type === 'request_review') {
    return 'Review requested';
  }
  if (event.type === 'review_result') {
    const message = payloadMessage(event);
    return message ? `Review result: ${message}` : 'Review result';
  }
  if (event.type === 'announcement') {
    const message = payloadMessage(event);
    return message ? `Announcement: ${message}` : 'Announcement';
  }
  return null;
}

/**
 * Rebuilds the room timeline as a derived view over significant RoomBus events.
 * Deterministic ids (one per source event) make the rebuild idempotent. The
 * timeline is a progress summary, never a source of truth (blueprint rule 10).
 */
export function refreshRoomTimeline(workspaceRootPath: string, roomId: string): TimelineItem[] {
  const room = loadRoom(workspaceRootPath, roomId);
  if (!room) {
    throw new Error(`Room not found: ${roomId}`);
  }

  const timeline: TimelineItem[] = [];
  for (const event of room.events) {
    const title = milestoneTitle(room, event);
    if (!title) continue;

    timeline.push({
      id: `timeline_${event.id}`,
      roomId: room.id,
      title,
      description: payloadMessage(event),
      phase: room.phase,
      sourceEventIds: [event.id],
      sourceArtifactIds: event.artifactId ? [event.artifactId] : [],
      sourceDecisionIds: event.decisionId ? [event.decisionId] : [],
      createdAt: event.createdAt,
    });
  }

  timeline.sort((a, b) => a.createdAt - b.createdAt);
  room.timeline = timeline;
  saveRoom(workspaceRootPath, room);
  return timeline;
}
