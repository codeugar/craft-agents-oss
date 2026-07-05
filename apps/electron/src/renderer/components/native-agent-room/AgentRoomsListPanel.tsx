import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, MessagesSquare, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { AgentDefinition, Room } from '@craft-agent/shared/native-agent-room'

export interface AgentRoomsListPanelProps {
  workspaceId: string
  selectedRoomId?: string | null
  selectedAgentDefinitionId?: string | null
  onRoomClick: (room: Room) => void
  onAgentClick: (agent: AgentDefinition) => void
  onNewAgentClick: () => void
  /** Bumped by the parent to force a refresh (e.g. after an agent is saved). */
  refreshToken?: number
  className?: string
}

const ROOM_STATUS_DOT: Record<Room['status'], string> = {
  draft: 'bg-muted-foreground/40',
  active: 'bg-emerald-500',
  paused: 'bg-amber-500',
  completed: 'bg-blue-500',
  archived: 'bg-muted-foreground/40',
}

function SectionHeader({ title, onAdd, addTooltip }: { title: string; onAdd?: () => void; addTooltip?: string }) {
  return (
    <div className="flex items-center justify-between px-3 pt-4 pb-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</span>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          title={addTooltip}
          className="p-0.5 rounded hover:bg-foreground/[0.06] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function RowButton({
  selected,
  onClick,
  icon,
  title,
  subtitle,
  trailing,
}: {
  selected: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  subtitle?: string
  trailing?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-left rounded-[8px] transition-colors',
        selected ? 'bg-foreground/[0.06]' : 'hover:bg-foreground/[0.03]',
      )}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium truncate">{title}</span>
        {subtitle && <span className="block text-[11px] text-muted-foreground truncate">{subtitle}</span>}
      </span>
      {trailing}
    </button>
  )
}

export function AgentRoomsListPanel({
  workspaceId,
  selectedRoomId,
  selectedAgentDefinitionId,
  onRoomClick,
  onAgentClick,
  onNewAgentClick,
  refreshToken,
  className,
}: AgentRoomsListPanelProps) {
  const { t } = useTranslation()
  const [rooms, setRooms] = React.useState<Room[]>([])
  const [agents, setAgents] = React.useState<AgentDefinition[]>([])
  const [newRoomOpen, setNewRoomOpen] = React.useState(false)
  const [newRoomName, setNewRoomName] = React.useState('')
  const [newRoomGoal, setNewRoomGoal] = React.useState('')
  const [newRoomAgentIds, setNewRoomAgentIds] = React.useState<string[]>([])
  const [creating, setCreating] = React.useState(false)

  const reload = React.useCallback(async () => {
    try {
      const [roomList, agentList] = await Promise.all([
        window.electronAPI.listAgentRooms(workspaceId),
        window.electronAPI.listAgentDefinitions(workspaceId),
      ])
      setRooms(roomList)
      setAgents(agentList)
    } catch (error) {
      console.error('Failed to load agent rooms', error)
    }
  }, [workspaceId])

  // Selection changes (e.g. a newly saved agent becoming selected) refresh the lists.
  React.useEffect(() => {
    void reload()
  }, [reload, refreshToken, selectedRoomId, selectedAgentDefinitionId])

  const toggleNewRoomAgent = (agentId: string) => {
    setNewRoomAgentIds((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId],
    )
  }

  const handleCreateRoom = async () => {
    if (!newRoomName.trim() || newRoomAgentIds.length === 0) return
    setCreating(true)
    try {
      const room = await window.electronAPI.createAgentRoom(workspaceId, {
        name: newRoomName.trim(),
        goal: newRoomGoal.trim(),
        agentDefinitionIds: newRoomAgentIds,
      })
      setNewRoomOpen(false)
      setNewRoomName('')
      setNewRoomGoal('')
      setNewRoomAgentIds([])
      await reload()
      onRoomClick(room)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('agentRooms.createRoomFailed'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className={cn('flex-1 min-h-0 overflow-y-auto px-1.5 pb-4', className)} data-list-role="agent-rooms">
      <SectionHeader
        title={t('agentRooms.roomsSection')}
        onAdd={() => setNewRoomOpen(true)}
        addTooltip={t('agentRooms.newRoom')}
      />
      {rooms.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">{t('agentRooms.noRooms')}</p>
      ) : (
        rooms.map((room) => (
          <RowButton
            key={room.id}
            selected={room.id === selectedRoomId}
            onClick={() => onRoomClick(room)}
            icon={<MessagesSquare className="h-4 w-4" />}
            title={room.name}
            subtitle={t('agentRooms.memberCount', { count: room.members.length })}
            trailing={<span className={cn('h-1.5 w-1.5 rounded-full shrink-0', ROOM_STATUS_DOT[room.status])} />}
          />
        ))
      )}

      <SectionHeader
        title={t('agentRooms.agentsSection')}
        onAdd={onNewAgentClick}
        addTooltip={t('agentRooms.newAgent')}
      />
      {agents.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">{t('agentRooms.noAgents')}</p>
      ) : (
        agents.map((agent) => (
          <RowButton
            key={agent.id}
            selected={agent.id === selectedAgentDefinitionId}
            onClick={() => onAgentClick(agent)}
            icon={<Bot className="h-4 w-4" />}
            title={agent.name}
            subtitle={agent.roleKey}
          />
        ))
      )}

      <Dialog open={newRoomOpen} onOpenChange={setNewRoomOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('agentRooms.newRoom')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('agentRooms.roomName')}</label>
              <Input
                value={newRoomName}
                onChange={(event) => setNewRoomName(event.target.value)}
                placeholder={t('agentRooms.roomNamePlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('agentRooms.roomGoal')}</label>
              <Textarea
                value={newRoomGoal}
                onChange={(event) => setNewRoomGoal(event.target.value)}
                placeholder={t('agentRooms.roomGoalPlaceholder')}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('agentRooms.pickAgents')}</label>
              {agents.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('agentRooms.noAgentsHint')}</p>
              ) : (
                <div className="max-h-44 overflow-y-auto rounded-[8px] border border-foreground/10 p-1">
                  {agents.map((agent) => (
                    <label
                      key={agent.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-[6px] hover:bg-foreground/[0.03] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={newRoomAgentIds.includes(agent.id)}
                        onChange={() => toggleNewRoomAgent(agent.id)}
                      />
                      <span className="text-[13px] font-medium">{agent.name}</span>
                      <span className="text-[11px] text-muted-foreground">{agent.roleKey}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewRoomOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => void handleCreateRoom()}
              disabled={creating || !newRoomName.trim() || newRoomAgentIds.length === 0}
            >
              {t('agentRooms.createRoom')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
