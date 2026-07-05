import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ConnectionOption {
  slug: string
  name: string
  defaultModel?: string
  models?: Array<string | { id: string; name?: string }>
}

export interface RoomModelSelectorProps {
  workspaceId: string
  roomId: string
  /** Current room connection slug (undefined = workspace default). */
  llmConnectionSlug?: string
  /** Current room model id (undefined = connection default). */
  model?: string
  onChanged: () => void
  className?: string
}

function modelId(m: string | { id: string }): string {
  return typeof m === 'string' ? m : m.id
}
function modelLabel(m: string | { id: string; name?: string }): string {
  return typeof m === 'string' ? m : m.name ?? m.id
}

export function RoomModelSelector({
  workspaceId,
  roomId,
  llmConnectionSlug,
  model,
  onChanged,
  className,
}: RoomModelSelectorProps) {
  const { t } = useTranslation()
  const [connections, setConnections] = React.useState<ConnectionOption[]>([])
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    // LLM connections are global (not workspace-scoped).
    void (async () => {
      try {
        const list = await window.electronAPI.listLlmConnections()
        setConnections(list as unknown as ConnectionOption[])
      } catch (error) {
        console.error('Failed to load LLM connections', error)
      }
    })()
  }, [])

  const activeConnection = connections.find((c) => c.slug === llmConnectionSlug)
  const models = activeConnection?.models ?? []

  const save = async (next: { llmConnectionSlug?: string; model?: string }) => {
    setSaving(true)
    try {
      await window.electronAPI.setAgentRoomModel(workspaceId, roomId, next)
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('agentRooms.modelChangeFailed'))
    } finally {
      setSaving(false)
    }
  }

  const selectClass =
    'h-7 rounded-[7px] border border-foreground/10 bg-transparent px-2 text-[11px] text-foreground/80 ' +
    'hover:bg-foreground/[0.03] focus:outline-none focus:ring-1 focus:ring-foreground/20 disabled:opacity-50 max-w-[150px] truncate'

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {/* Connection: empty value = workspace default */}
      <select
        className={selectClass}
        value={llmConnectionSlug ?? ''}
        disabled={saving}
        title={t('agentRooms.connectionLabel')}
        onChange={(e) => {
          const slug = e.target.value || undefined
          const conn = connections.find((c) => c.slug === slug)
          // Reset model to the new connection's default when the connection changes.
          void save({ llmConnectionSlug: slug, model: conn?.defaultModel })
        }}
      >
        <option value="">{t('agentRooms.workspaceDefault')}</option>
        {connections.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>

      {/* Model: only meaningful once a specific connection is chosen */}
      {llmConnectionSlug && models.length > 0 && (
        <select
          className={selectClass}
          value={model ?? activeConnection?.defaultModel ?? ''}
          disabled={saving}
          title={t('agentRooms.modelLabel')}
          onChange={(e) => void save({ llmConnectionSlug, model: e.target.value || undefined })}
        >
          {models.map((m) => (
            <option key={modelId(m)} value={modelId(m)}>
              {modelLabel(m)}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
