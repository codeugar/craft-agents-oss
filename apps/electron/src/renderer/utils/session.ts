import type { Session } from "../../shared/types"

/**
 * Get display title for a session.
 * Priority: custom name > first user message > preview (from metadata) > agent name > "New chat"
 */
export function getSessionTitle(session: Session): string {
  if (session.name) {
    return session.name
  }

  // Check loaded messages first
  const firstUserMessage = session.messages.find(m => m.role === 'user')
  if (firstUserMessage?.content) {
    const trimmed = firstUserMessage.content.slice(0, 50)
    return trimmed.length < firstUserMessage.content.length
      ? trimmed + '…'
      : trimmed
  }

  // Fall back to preview from JSONL header (for lazy-loaded sessions)
  if (session.preview) {
    const trimmed = session.preview.slice(0, 50)
    return trimmed.length < session.preview.length
      ? trimmed + '…'
      : trimmed
  }

  // For agent sessions, show the agent name instead of generic "New chat"
  if (session.agentName) {
    return session.agentName
  }

  return 'New chat'
}
