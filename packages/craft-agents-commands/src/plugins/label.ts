import { listLabels, getLabel } from '@craft-agent/shared/labels/storage'
import { createLabel, updateLabel, deleteLabel, moveLabel, reorderLabels } from '@craft-agent/shared/labels/crud'
import { getCliDomainPolicy } from '@craft-agent/shared/config'
import {
  assertKnownAction,
  ensureString,
  parseEntityColor,
  parseNullableParent,
  parseStructuredInput,
  parseTokens,
  validateValueType,
  usageError,
} from '../utils.ts'
import type { CommandPlugin } from './types.ts'

const actions = ['list', 'get', 'create', 'update', 'delete', 'move', 'reorder'] as const
const labelPolicy = getCliDomainPolicy('label')

export const labelPlugin: CommandPlugin = {
  namespace: 'label',
  actions,
  docsMarker: 'label',
  docsHeading: 'Label',
  policy: {
    preToolGuards: {
      redirectHelpCommand: labelPolicy.helpCommand,
      workspacePathScopes: [...labelPolicy.workspacePathScopes],
    },
    exploreAllowlist: {
      readActions: [...labelPolicy.readActions],
      allowGlobalFlags: true,
    },
  },
  async execute(action, tokens, context) {
    assertKnownAction('label', action, actions)

    const { positional, options } = parseTokens(tokens)
    const structured = parseStructuredInput(options)
    const workspaceRootPath = context.workspaceRootPath

    if (action === 'list') {
      return { labels: listLabels(workspaceRootPath) }
    }

    if (action === 'get') {
      const labelId = positional[0]
      if (!labelId) usageError('label get requires <id>', 'Run: craft-agent label get <id>')
      const label = getLabel(workspaceRootPath, labelId)
      if (!label) usageError(`Label not found: ${labelId}`)
      return { label }
    }

    if (action === 'create') {
      const name = (structured.name ?? options.name) as unknown
      const parentIdRaw = (structured.parentId ?? options['parent-id']) as string | boolean | undefined
      const color = parseEntityColor(structured.color ?? options.color)
      const valueType = validateValueType(structured.valueType ?? options['value-type'])

      const created = createLabel(workspaceRootPath, {
        name: ensureString(name, 'name'),
        parentId: parseNullableParent(parentIdRaw) ?? undefined,
        color: color as any,
        valueType,
      })

      return { label: created }
    }

    if (action === 'update') {
      const labelId = positional[0]
      if (!labelId) usageError('label update requires <id>', 'Run: craft-agent label update <id> --name "..."')

      const updates = {
        name: (structured.name ?? options.name) as string | undefined,
        color: parseEntityColor(structured.color ?? options.color) as any,
        valueType: validateValueType(structured.valueType ?? options['value-type']),
      }

      if (updates.name === undefined && updates.color === undefined && updates.valueType === undefined) {
        usageError('label update requires at least one field to update', 'Use --name, --color, --value-type, or --json')
      }

      const updated = updateLabel(workspaceRootPath, labelId, updates)
      return { label: updated }
    }

    if (action === 'delete') {
      const labelId = positional[0]
      if (!labelId) usageError('label delete requires <id>', 'Run: craft-agent label delete <id>')
      const result = deleteLabel(workspaceRootPath, labelId)
      return { deleted: labelId, strippedSessions: result.stripped }
    }

    if (action === 'move') {
      const labelId = positional[0]
      if (!labelId) usageError('label move requires <id>', 'Run: craft-agent label move <id> --parent <id|root>')

      const parentRaw = (structured.parent ?? options.parent) as string | boolean | undefined
      const newParent = parseNullableParent(parentRaw)
      if (newParent === undefined) usageError('label move requires --parent <id|root>')

      moveLabel(workspaceRootPath, labelId, newParent)
      return { moved: labelId, parent: newParent }
    }

    if (action === 'reorder') {
      const parentRaw = (structured.parent ?? options.parent) as string | boolean | undefined
      const parentId = parseNullableParent(parentRaw)

      const orderedIdsFromStructured = Array.isArray(structured.orderedIds)
        ? structured.orderedIds.map(String)
        : undefined
      const orderedIds = orderedIdsFromStructured ?? positional

      if (!orderedIds || orderedIds.length === 0) {
        usageError('label reorder requires ordered label IDs', 'Run: craft-agent label reorder --parent root bug feature docs')
      }

      reorderLabels(workspaceRootPath, parentId ?? null, orderedIds)
      return { reordered: orderedIds, parent: parentId ?? null }
    }

    usageError(`Unhandled label action: ${action}`)
  },
}
