import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Loader2, Pause, Play, Send, User } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RoomModelSelector } from '@/components/native-agent-room/RoomModelSelector'
import type {
  Project,
  Room,
  RoomBusEvent,
  RoomMember,
  TurnLog,
} from '@craft-agent/shared/native-agent-room'

export interface AgentRoomPageProps {
  workspaceId: string
  roomId: string
}

const EVENT_TYPE_STYLE: Record<string, string> = {
  message: 'bg-foreground/[0.06] text-muted-foreground',
  ask_agent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  answer_agent: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  raise_blocker: 'bg-red-500/10 text-red-600 dark:text-red-400',
  resolve_blocker: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  request_review: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  review_result: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  handoff_task: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  artifact_update: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  decision: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  approval_request: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  announcement: 'bg-foreground/[0.06] text-muted-foreground',
}

const MEMBER_STATUS_DOT: Record<RoomMember['status'], string> = {
  idle: 'bg-muted-foreground/40',
  working: 'bg-emerald-500',
  blocked: 'bg-red-500',
  waiting_review: 'bg-purple-500',
  done: 'bg-blue-500',
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function payloadMessage(event: RoomBusEvent): string {
  return typeof event.payload.message === 'string' ? event.payload.message : ''
}

export default function AgentRoomPage({ workspaceId, roomId }: AgentRoomPageProps) {
  const { t } = useTranslation()
  const [room, setRoom] = React.useState<Room | null>(null)
  const [project, setProject] = React.useState<Project | null>(null)
  const [running, setRunning] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const [selectedMemberId, setSelectedMemberId] = React.useState<string | null>(null)
  const streamEndRef = React.useRef<HTMLDivElement>(null)

  const reload = React.useCallback(async (): Promise<boolean> => {
    try {
      const result = await window.electronAPI.getAgentRoom(workspaceId, roomId)
      setRoom(result.room)
      setProject(result.project)
      return result.isRunning
    } catch (error) {
      console.error('Failed to load room', error)
      return false
    }
  }, [workspaceId, roomId])

  React.useEffect(() => {
    setRoom(null)
    setSelectedMemberId(null)
    void reload()
  }, [reload])

  // Live updates: the server pushes ROOMS_CHANGED (workspace-scoped) after every
  // user message, status change, and agent turn — so we refetch on push instead
  // of polling. `running` is derived from the pushed isRunning flag.
  React.useEffect(() => {
    const cleanup = window.electronAPI.onAgentRoomChanged((changedRoomId) => {
      if (changedRoomId !== roomId) return
      void (async () => {
        const isRunning = await reload()
        setRunning(isRunning)
      })()
    })
    return cleanup
  }, [roomId, reload])

  React.useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [room?.events.length])

  const memberById = React.useMemo(() => {
    const map = new Map<string, RoomMember>()
    for (const member of room?.members ?? []) map.set(member.id, member)
    return map
  }, [room])

  const displayName = React.useCallback(
    (id: string): string => {
      if (id === 'user') return t('agentRooms.you')
      if (id === 'system') return t('agentRooms.system')
      return memberById.get(id)?.name ?? id
    },
    [memberById, t],
  )

  const unreadCount = React.useCallback(
    (memberId: string): number =>
      room?.inboxes
        .find((inbox) => inbox.agentId === memberId)
        ?.items.filter((item) => item.status === 'unread').length ?? 0,
    [room],
  )

  // Starts a detached scheduler run on the server. Progress arrives via the
  // ROOMS_CHANGED push subscription above (no polling); we just optimistically
  // flag running so the UI shows the working state immediately.
  const runRoom = React.useCallback(async () => {
    setRunning(true)
    try {
      await window.electronAPI.runAgentRoom(workspaceId, roomId)
    } catch (error) {
      setRunning(false)
      toast.error(error instanceof Error ? error.message : t('agentRooms.runFailed'))
    }
  }, [workspaceId, roomId, t])

  const handleSend = async () => {
    const message = draft.trim()
    if (!message || !room) return
    setSending(true)
    try {
      await window.electronAPI.postAgentRoomMessage(workspaceId, roomId, message)
      setDraft('')
      await reload()
      if (room.status !== 'paused') {
        void runRoom()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('agentRooms.sendFailed'))
    } finally {
      setSending(false)
    }
  }

  const togglePause = async () => {
    if (!room) return
    const next = room.status === 'paused' ? 'active' : 'paused'
    try {
      await window.electronAPI.setAgentRoomStatus(workspaceId, roomId, next)
      await reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('agentRooms.statusChangeFailed'))
    }
  }

  if (!room) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">{t('common.loading')}</p>
      </div>
    )
  }

  const artifacts = [...(project?.artifacts ?? []), ...room.artifacts]
  const turnLogs = [...(room.turnLogs ?? [])].reverse()
  const visibleTurnLogs = selectedMemberId
    ? turnLogs.filter((log) => log.agentId === selectedMemberId)
    : turnLogs
  const paused = room.status === 'paused'

  return (
    <div className="flex h-full min-h-0">
      {/* Left: members */}
      <div className="w-56 shrink-0 border-r border-foreground/[0.06] overflow-y-auto p-2 space-y-1">
        <p className="px-2 pt-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('agentRooms.members')}
        </p>
        {room.members.map((member) => {
          const unread = unreadCount(member.id)
          const selected = member.id === selectedMemberId
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => setSelectedMemberId(selected ? null : member.id)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 rounded-[8px] text-left transition-colors',
                selected ? 'bg-foreground/[0.06]' : 'hover:bg-foreground/[0.03]',
              )}
            >
              <span className="relative shrink-0">
                <span className="h-7 w-7 rounded-full bg-foreground/[0.05] flex items-center justify-center">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                </span>
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-background',
                    MEMBER_STATUS_DOT[member.status],
                  )}
                />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium truncate">{member.name}</span>
                <span className="block text-[11px] text-muted-foreground truncate">{member.roleKey}</span>
              </span>
              {unread > 0 && (
                <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] font-medium flex items-center justify-center">
                  {unread}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Middle: event stream + composer */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-foreground/[0.06]">
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold truncate">{room.name}</h1>
            {room.goal && <p className="text-[11px] text-muted-foreground truncate">{room.goal}</p>}
          </div>
          {running && (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('agentRooms.agentsWorking')}
            </span>
          )}
          <RoomModelSelector
            workspaceId={workspaceId}
            roomId={roomId}
            llmConnectionSlug={room.llmConnectionSlug}
            model={room.model}
            onChanged={() => void reload()}
          />
          <Button variant="ghost" size="sm" onClick={() => void togglePause()}>
            {paused ? <Play className="h-3.5 w-3.5 mr-1" /> : <Pause className="h-3.5 w-3.5 mr-1" />}
            {paused ? t('agentRooms.resume') : t('agentRooms.pause')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void runRoom()} disabled={running || paused}>
            <Play className="h-3.5 w-3.5 mr-1" />
            {t('agentRooms.run')}
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          {room.events.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <p className="text-sm font-medium">{t('agentRooms.emptyRoomTitle')}</p>
              <p className="text-xs mt-1 max-w-xs">{t('agentRooms.emptyRoomHint')}</p>
            </div>
          )}
          {room.events.map((event) => {
            const fromUser = event.from === 'user'
            const message = payloadMessage(event)
            const targets = (event.to ?? [])
              .map((target) => {
                if (target.type === 'agent') return displayName(target.id)
                if (target.type === 'role') return `@${target.roleKey}`
                if (target.type === 'all') return t('agentRooms.everyone')
                return null
              })
              .filter(Boolean)
              .join(', ')
            return (
              <div key={event.id} className={cn('flex gap-2.5', fromUser && 'flex-row-reverse')}>
                <span className="shrink-0 h-7 w-7 rounded-full bg-foreground/[0.05] flex items-center justify-center mt-0.5">
                  {fromUser ? (
                    <User className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Bot className="h-4 w-4 text-muted-foreground" />
                  )}
                </span>
                <div className={cn('max-w-[75%] min-w-0', fromUser && 'text-right')}>
                  <div className={cn('flex items-center gap-1.5 mb-0.5 flex-wrap', fromUser && 'justify-end')}>
                    <span className="text-[11px] font-medium">{displayName(event.from)}</span>
                    {targets && <span className="text-[11px] text-muted-foreground">→ {targets}</span>}
                    <span
                      className={cn(
                        'px-1.5 py-px rounded-full text-[9px] font-mono',
                        EVENT_TYPE_STYLE[event.type] ?? 'bg-foreground/[0.06] text-muted-foreground',
                      )}
                    >
                      {event.type}
                    </span>
                    {event.status === 'resolved' && (
                      <span className="text-[9px] text-emerald-600 dark:text-emerald-400">✓ {t('agentRooms.resolved')}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground/70">{formatTime(event.createdAt)}</span>
                  </div>
                  <div
                    className={cn(
                      'inline-block px-3 py-2 rounded-[10px] text-[13px] whitespace-pre-wrap break-words text-left',
                      fromUser ? 'bg-accent text-accent-foreground' : 'bg-foreground/[0.04]',
                    )}
                  >
                    {message || <span className="italic text-muted-foreground">{event.type}</span>}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={streamEndRef} />
        </div>

        <div className="shrink-0 border-t border-foreground/[0.06] p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void handleSend()
                }
              }}
              placeholder={t('agentRooms.composerPlaceholder')}
              rows={2}
              className="flex-1 resize-none"
            />
            <Button onClick={() => void handleSend()} disabled={sending || running || !draft.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">{t('agentRooms.composerHint')}</p>
        </div>
      </div>

      {/* Right: artifacts / decisions / timeline / context used */}
      <div className="w-72 shrink-0 border-l border-foreground/[0.06] flex flex-col min-h-0">
        <Tabs defaultValue="artifacts" className="flex-1 min-h-0 flex flex-col">
          <TabsList className="shrink-0 mx-2 mt-2">
            <TabsTrigger value="artifacts" className="text-[11px]">{t('agentRooms.artifactsTab')}</TabsTrigger>
            <TabsTrigger value="timeline" className="text-[11px]">{t('agentRooms.timelineTab')}</TabsTrigger>
            <TabsTrigger value="context" className="text-[11px]">{t('agentRooms.contextTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="artifacts" className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {artifacts.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">{t('agentRooms.noArtifacts')}</p>
            ) : (
              artifacts.map((artifact) => (
                <div key={artifact.id} className="px-2.5 py-2 rounded-[8px] bg-foreground/[0.03]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-medium truncate flex-1">{artifact.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">v{artifact.version}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">{artifact.type}</span>
                    <span
                      className={cn(
                        'px-1.5 py-px rounded-full text-[9px]',
                        artifact.status === 'approved'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : artifact.status === 'deprecated'
                            ? 'bg-foreground/[0.06] text-muted-foreground line-through'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                      )}
                    >
                      {artifact.status}
                    </span>
                    {artifact.scope === 'project' && (
                      <span className="text-[9px] text-muted-foreground">{t('agentRooms.projectScope')}</span>
                    )}
                  </div>
                </div>
              ))
            )}
            {room.decisions.length > 0 && (
              <>
                <p className="px-2 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('agentRooms.decisions')}
                </p>
                {room.decisions.map((decision) => (
                  <div key={decision.id} className="px-2.5 py-2 rounded-[8px] bg-foreground/[0.03]">
                    <span className="text-[12px] font-medium">{decision.title}</span>
                    <span className="block text-[10px] text-muted-foreground">{decision.status}</span>
                  </div>
                ))}
              </>
            )}
          </TabsContent>

          <TabsContent value="timeline" className="flex-1 min-h-0 overflow-y-auto p-2">
            {room.timeline.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">{t('agentRooms.noTimeline')}</p>
            ) : (
              <div className="space-y-0 px-2">
                {room.timeline.map((item) => (
                  <div key={item.id} className="relative pl-4 pb-3 border-l border-foreground/10 last:border-transparent">
                    <span className="absolute -left-[3px] top-1 h-1.5 w-1.5 rounded-full bg-foreground/30" />
                    <p className="text-[12px] font-medium leading-tight">{item.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatTime(item.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="context" className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
            {selectedMemberId && (
              <p className="px-2 text-[10px] text-muted-foreground">
                {t('agentRooms.contextFilteredBy', { name: displayName(selectedMemberId) })}
              </p>
            )}
            {visibleTurnLogs.length === 0 ? (
              <p className="px-2 py-2 text-xs text-muted-foreground">{t('agentRooms.noTurns')}</p>
            ) : (
              visibleTurnLogs.map((log: TurnLog) => (
                <div key={log.id} className="px-2.5 py-2 rounded-[8px] bg-foreground/[0.03]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-medium flex-1 truncate">{displayName(log.agentId)}</span>
                    <span className="text-[10px] text-muted-foreground">{formatTime(log.createdAt)}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {t('agentRooms.turnSummary', {
                      published: log.publishedEventIds.length,
                      rejected: log.rejectedActionCount,
                    })}
                  </p>
                  <div className="mt-1.5 space-y-0.5">
                    {log.contextUsed.map((item, index) => (
                      <p key={`${log.id}-${index}`} className="text-[10px] text-muted-foreground truncate">
                        <span className="font-mono text-foreground/60">{item.type}</span> · {item.label}
                      </p>
                    ))}
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
