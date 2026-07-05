import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { AgentDefinition, RoomBusActionType } from '@craft-agent/shared/native-agent-room'

const ALL_ACTIONS: RoomBusActionType[] = [
  'message',
  'ask_agent',
  'answer_agent',
  'raise_blocker',
  'resolve_blocker',
  'handoff_task',
  'request_review',
  'review_result',
  'propose_change',
  'artifact_update',
  'decision',
  'approval_request',
  'announcement',
]

export interface AgentDefinitionPageProps {
  workspaceId: string
  /** 'new' opens an empty create form. */
  agentDefinitionId: string
  onSaved: (agent: AgentDefinition) => void
  onDeleted: () => void
}

interface FormState {
  name: string
  roleKey: string
  description: string
  mission: string
  prompt: string
  responsibilities: string
  allowedActions: RoomBusActionType[]
}

const EMPTY_FORM: FormState = {
  name: '',
  roleKey: '',
  description: '',
  mission: '',
  prompt: '',
  responsibilities: '',
  allowedActions: ['ask_agent', 'answer_agent', 'request_review', 'review_result', 'artifact_update', 'announcement'],
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

export default function AgentDefinitionPage({
  workspaceId,
  agentDefinitionId,
  onSaved,
  onDeleted,
}: AgentDefinitionPageProps) {
  const { t } = useTranslation()
  const isNew = agentDefinitionId === 'new'
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = React.useState(!isNew)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    if (isNew) {
      setForm(EMPTY_FORM)
      setLoading(false)
      return
    }
    setLoading(true)
    void (async () => {
      try {
        const agents = await window.electronAPI.listAgentDefinitions(workspaceId)
        const agent = agents.find((item) => item.id === agentDefinitionId)
        if (!cancelled && agent) {
          setForm({
            name: agent.name,
            roleKey: agent.roleKey,
            description: agent.description ?? '',
            mission: agent.mission,
            prompt: agent.prompt,
            responsibilities: agent.responsibilities.join('\n'),
            allowedActions: agent.allowedActions,
          })
        }
      } catch (error) {
        console.error('Failed to load agent definition', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId, agentDefinitionId, isNew])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const toggleAction = (action: RoomBusActionType) => {
    setForm((prev) => ({
      ...prev,
      allowedActions: prev.allowedActions.includes(action)
        ? prev.allowedActions.filter((item) => item !== action)
        : [...prev.allowedActions, action],
    }))
  }

  const valid = form.name.trim().length > 0 && form.roleKey.trim().length > 0 && form.prompt.trim().length > 0

  const handleSave = async () => {
    if (!valid) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        roleKey: form.roleKey.trim(),
        description: form.description.trim() || undefined,
        mission: form.mission.trim(),
        prompt: form.prompt,
        responsibilities: form.responsibilities
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        allowedActions: form.allowedActions,
      }
      const agent = isNew
        ? await window.electronAPI.createAgentDefinition(workspaceId, payload)
        : await window.electronAPI.updateAgentDefinition(workspaceId, agentDefinitionId, payload)
      toast.success(t('agentRooms.agentSaved'))
      onSaved(agent)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('agentRooms.agentSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      await window.electronAPI.deleteAgentDefinition(workspaceId, agentDefinitionId)
      toast.success(t('agentRooms.agentDeleted'))
      onDeleted()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('agentRooms.agentDeleteFailed'))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-[10px] bg-foreground/[0.05] flex items-center justify-center">
            <Bot className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate">
              {isNew ? t('agentRooms.newAgent') : form.name || t('agentRooms.editAgent')}
            </h1>
            <p className="text-xs text-muted-foreground">{t('agentRooms.agentEditorSubtitle')}</p>
          </div>
          {!isNew && (
            <Button variant="ghost" size="sm" onClick={() => void handleDelete()}>
              <Trash2 className="h-4 w-4 mr-1" />
              {t('common.delete')}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('agentRooms.agentName')}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('agentRooms.agentNamePlaceholder')} />
          </Field>
          <Field label={t('agentRooms.roleKey')}>
            <Input value={form.roleKey} onChange={(e) => set('roleKey', e.target.value)} placeholder="frontend" />
          </Field>
        </div>

        <Field label={t('agentRooms.agentDescription')}>
          <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder={t('agentRooms.agentDescriptionPlaceholder')} />
        </Field>

        <Field label={t('agentRooms.mission')}>
          <Input value={form.mission} onChange={(e) => set('mission', e.target.value)} placeholder={t('agentRooms.missionPlaceholder')} />
        </Field>

        <Field label={t('agentRooms.rolePrompt')}>
          <Textarea
            value={form.prompt}
            onChange={(e) => set('prompt', e.target.value)}
            placeholder={t('agentRooms.rolePromptPlaceholder')}
            rows={8}
            className="font-mono text-[12px]"
          />
        </Field>

        <Field label={t('agentRooms.responsibilities')}>
          <Textarea
            value={form.responsibilities}
            onChange={(e) => set('responsibilities', e.target.value)}
            placeholder={t('agentRooms.responsibilitiesPlaceholder')}
            rows={3}
          />
        </Field>

        <Field label={t('agentRooms.allowedActions')}>
          <div className="grid grid-cols-3 gap-1.5">
            {ALL_ACTIONS.map((action) => {
              const active = form.allowedActions.includes(action)
              return (
                <button
                  key={action}
                  type="button"
                  onClick={() => toggleAction(action)}
                  className={cn(
                    'px-2 py-1.5 rounded-[8px] text-[11px] font-mono text-left transition-colors border',
                    active
                      ? 'border-foreground/20 bg-foreground/[0.06]'
                      : 'border-foreground/10 text-muted-foreground hover:bg-foreground/[0.03]',
                  )}
                >
                  {action}
                </button>
              )
            })}
          </div>
        </Field>

        <div className="flex justify-end gap-2 pb-8">
          <Button onClick={() => void handleSave()} disabled={!valid || saving}>
            {saving ? t('common.saving') : isNew ? t('agentRooms.createAgent') : t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
