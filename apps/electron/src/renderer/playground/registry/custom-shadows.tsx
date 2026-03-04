import * as React from 'react'
import type { ComponentEntry } from './types'
import { cn } from '@/lib/utils'

type ShadowKind = 'class' | 'inline' | 'arbitrary' | 'runtime'

interface ShadowSpec {
  id: string
  component: string
  file: string
  kind: ShadowKind
  shadow: string
  border: string
  hasExplicitBorder: boolean
  note?: string
  previewClassName?: string
  previewStyle?: React.CSSProperties
}

const activeShadowSpecs: ShadowSpec[] = [
  {
    id: 'session-item-badge',
    component: 'SessionItem (match badge)',
    file: 'components/app-shell/SessionItem.tsx',
    kind: 'inline',
    shadow: "boxShadow: '0 1px 2px rgba(...)'",
    border: "class: 'border border-yellow-500'",
    hasExplicitBorder: true,
    note: 'Selected / unselected match count badge uses inline shadow tint.',
    previewClassName: 'rounded-[6px] bg-yellow-300/40 border border-yellow-500 px-2 py-1 text-[10px] font-medium',
    previewStyle: { boxShadow: '0 1px 2px 0 rgba(234, 179, 8, 0.3)' },
  },
  {
    id: 'ui-button',
    component: 'Button',
    file: 'components/ui/button.tsx',
    kind: 'class',
    shadow: 'shadow / shadow-sm',
    border: "outline variant: 'border border-foreground/15' (default variant: none)",
    hasExplicitBorder: true,
    previewClassName: 'rounded-md bg-background border border-foreground/15 shadow-sm px-3 py-2 text-sm',
  },
  {
    id: 'ui-input',
    component: 'Input',
    file: 'components/ui/input.tsx',
    kind: 'class',
    shadow: 'shadow-sm',
    border: "class: 'border border-foreground/15'",
    hasExplicitBorder: true,
    previewClassName: 'rounded-md border border-foreground/15 bg-transparent shadow-sm px-3 py-2 text-sm w-full',
  },
  {
    id: 'ui-select-trigger',
    component: 'SelectTrigger',
    file: 'components/ui/select.tsx',
    kind: 'class',
    shadow: 'shadow-sm',
    border: "class: 'border border-foreground/15'",
    hasExplicitBorder: true,
    previewClassName: 'rounded-md border border-foreground/15 bg-transparent shadow-sm px-3 py-2 text-sm w-full',
  },
  {
    id: 'ui-table-head',
    component: 'TableHead / TableCell',
    file: 'components/ui/table.tsx',
    kind: 'arbitrary',
    shadow: 'shadow-[inset_0_-1.5px_0_var(--color-border)]',
    border: 'no explicit border class on cells; separator line encoded via inset shadow',
    hasExplicitBorder: false,
    previewClassName: 'rounded-md bg-card px-3 py-2 text-sm shadow-[inset_0_-1.5px_0_var(--color-border)]',
  },
  {
    id: 'mention-menu',
    component: 'InlineMentionMenu',
    file: 'components/ui/mention-menu.tsx',
    kind: 'class',
    shadow: 'shadow-modal-small + shadow-[0_0_0_1px_var(--shadow-tinted)]',
    border: 'container: none; badge ring simulated by arbitrary shadow + shadow-minimal',
    hasExplicitBorder: false,
    previewClassName: 'rounded-[8px] bg-background text-foreground shadow-modal-small p-2',
    note: 'Container uses modal shadow; type badge uses arbitrary ring shadow + shadow-minimal.',
  },
  {
    id: 'sortable-list-overlay',
    component: 'SortableList drag overlay',
    file: 'components/ui/sortable-list.tsx',
    kind: 'inline',
    shadow: "boxShadow: '0 0 0 1px rgba(...), 0 15px 15px ...'",
    border: 'none (1px edge is included inside boxShadow first layer)',
    hasExplicitBorder: false,
    previewClassName: 'rounded-[8px] bg-background px-3 py-2 text-sm',
    previewStyle: { boxShadow: '0 0 0 1px rgba(63, 63, 68, 0.05), 0px 15px 15px 0 rgba(34, 33, 81, 0.25)' },
  },
  {
    id: 'edit-popover',
    component: 'EditPopover surface',
    file: 'components/ui/EditPopover.tsx',
    kind: 'inline',
    shadow: "boxShadow: '0 4px 24px rgba(...) , 0 0 0 1px rgba(...)'",
    border: 'none (1px edge included via second shadow layer)',
    hasExplicitBorder: false,
    previewClassName: 'rounded-[8px] bg-background px-3 py-2 text-sm',
    previewStyle: { boxShadow: '0 4px 24px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)' },
  },
  {
    id: 'shortcuts-kbd',
    component: 'Settings Shortcuts kbd chip',
    file: 'pages/settings/ShortcutsPage.tsx',
    kind: 'class',
    shadow: 'shadow-sm',
    border: "class: 'border border-border'",
    hasExplicitBorder: true,
    previewClassName: 'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-medium font-sans bg-muted border border-border rounded shadow-sm',
  },
  {
    id: 'ui-tooltip',
    component: 'Tooltip content',
    file: 'packages/ui/components/tooltip.tsx',
    kind: 'inline',
    shadow: "boxShadow: '0 4px 12px rgba(0,0,0,0.15)'",
    border: 'none (tooltip currently relies on shadow only)',
    hasExplicitBorder: false,
    previewClassName: 'rounded-md bg-popover px-3 py-2 text-xs',
    previewStyle: { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' },
  },
  {
    id: 'ui-browser-controls',
    component: 'BrowserControls focus ring',
    file: 'packages/ui/components/ui/BrowserControls.tsx',
    kind: 'inline',
    shadow: "boxShadow: '0 0 0 1.5px var(--tb-focus-ring)'",
    border: "base state: 'border border-transparent'",
    hasExplicitBorder: true,
    previewClassName: 'rounded-md bg-background border border-transparent px-3 py-2 text-sm',
    previewStyle: { boxShadow: '0 0 0 1.5px var(--ring)' },
  },
  {
    id: 'ui-image-card-stack',
    component: 'ImageCardStack stacked card',
    file: 'packages/ui/components/markdown/ImageCardStack.tsx',
    kind: 'arbitrary',
    shadow: 'shadow-[1px_3px_8px_rgba(0,0,0,0.28)]',
    border: 'none (card depth comes entirely from arbitrary shadow)',
    hasExplicitBorder: false,
    previewClassName: 'rounded-[8px] bg-background px-3 py-2 text-sm shadow-[1px_3px_8px_rgba(0,0,0,0.28)]',
  },
]

const runtimeShadowSpecs: ShadowSpec[] = [
  {
    id: 'browser-pane-overlay',
    component: 'Browser pane live overlay',
    file: 'main/browser-pane-manager.ts + shared/browser-live-fx.ts',
    kind: 'runtime',
    shadow: "overlay.style.boxShadow = 'inset ... color-mix(...)'",
    border: "runtime class: 'border border-foreground/20' on overlay element",
    hasExplicitBorder: true,
    note: 'Main-process runtime overlay for browser live mode (not a React component).',
    previewClassName: 'rounded-[10px] bg-background px-3 py-2 text-sm border border-foreground/20',
    previewStyle: { boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--accent) 45%, transparent), inset 0 0 20px color-mix(in oklab, var(--accent) 28%, transparent)' },
  },
  {
    id: 'browser-cdp-annotation',
    component: 'CDP annotation box/point',
    file: 'main/browser-cdp.ts',
    kind: 'runtime',
    shadow: "box.style.boxShadow / point.style.boxShadow",
    border: 'no explicit border (edge shown via inset/outset shadow)',
    hasExplicitBorder: false,
    note: 'Debug annotation overlays drawn directly in webContents.',
    previewClassName: 'rounded-[6px] bg-black/80 text-white px-3 py-2 text-xs',
    previewStyle: { boxShadow: '0 0 0 1px rgba(255,255,255,0.8) inset' },
  },
]

const kindBadgeClass: Record<ShadowKind, string> = {
  class: 'bg-success/10 text-success',
  inline: 'bg-info/10 text-info',
  arbitrary: 'bg-destructive/10 text-destructive',
  runtime: 'bg-accent/10 text-accent',
}

function ValueBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-foreground/50">{label}</div>
      <div className="rounded-[8px] bg-foreground/3 p-2 text-[11px] text-foreground/70 font-mono leading-snug break-words">
        {value}
      </div>
    </div>
  )
}

function BorderBadge({ hasExplicitBorder }: { hasExplicitBorder: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium',
        hasExplicitBorder ? 'bg-success/10 text-success' : 'bg-foreground/10 text-foreground/70'
      )}
    >
      Border: {hasExplicitBorder ? 'Yes' : 'No'}
    </span>
  )
}

function ShadowSpecCard({ spec }: { spec: ShadowSpec }) {
  return (
    <div className="rounded-[10px] border border-border bg-background p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{spec.component}</div>
          <div className="text-[11px] text-foreground/50 truncate">{spec.file}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <BorderBadge hasExplicitBorder={spec.hasExplicitBorder} />
          <span className={cn('shrink-0 rounded-[6px] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide', kindBadgeClass[spec.kind])}>
            {spec.kind}
          </span>
        </div>
      </div>

      <ValueBlock label="Shadow" value={spec.shadow} />
      <ValueBlock label="Border" value={spec.border} />

      <div className="rounded-[8px] bg-foreground/2 p-3">
        <div className={cn('w-full flex items-center', spec.previewClassName)} style={spec.previewStyle}>
          Shadow + border preview
        </div>
      </div>

      {spec.note && <div className="text-[11px] text-foreground/60">{spec.note}</div>}
    </div>
  )
}

function Section({
  title,
  specs,
  shadowOnly,
}: {
  title: string
  specs: ShadowSpec[]
  shadowOnly: boolean
}) {
  const filteredSpecs = shadowOnly ? specs.filter((s) => !s.hasExplicitBorder) : specs
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-xs text-foreground/50">
          {filteredSpecs.length}/{specs.length} items
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filteredSpecs.map((spec) => <ShadowSpecCard key={spec.id} spec={spec} />)}
      </div>
      {filteredSpecs.length === 0 && (
        <div className="rounded-[8px] border border-border bg-foreground/2 p-3 text-sm text-foreground/60">
          No items in this section match the current filter.
        </div>
      )}
    </section>
  )
}

function CustomShadowsAudit() {
  const [shadowOnly, setShadowOnly] = React.useState(false)

  return (
    <div className="w-full max-w-[1200px] p-6 space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Custom Shadows Audit</h2>
        <p className="text-sm text-foreground/70">
          Consolidated review surface for components and runtime overlays that currently use non-standard shadow
          styles (custom classes, inline boxShadow, arbitrary shadow values, or runtime-injected shadows).
          Each card lists both the shadow value and border strategy.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-foreground/60">Filter:</span>
        <button
          type="button"
          onClick={() => setShadowOnly(false)}
          className={cn(
            'h-7 px-2.5 rounded-[6px] text-xs font-medium transition-colors',
            !shadowOnly ? 'bg-background shadow-minimal text-foreground' : 'bg-foreground/5 text-foreground/70 hover:bg-foreground/10'
          )}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setShadowOnly(true)}
          className={cn(
            'h-7 px-2.5 rounded-[6px] text-xs font-medium transition-colors',
            shadowOnly ? 'bg-background shadow-minimal text-foreground' : 'bg-foreground/5 text-foreground/70 hover:bg-foreground/10'
          )}
        >
          Shadow-only (no explicit border)
        </button>
      </div>

      <Section title="Active UI components" specs={activeShadowSpecs} shadowOnly={shadowOnly} />

      <Section title="Runtime overlays (main process)" specs={runtimeShadowSpecs} shadowOnly={shadowOnly} />
    </div>
  )
}

export const customShadowsComponents: ComponentEntry[] = [
  {
    id: 'custom-shadows-audit',
    name: 'Custom Shadows Audit',
    category: 'Custom Shadows',
    description: 'Review all components and runtime overlays that currently use custom shadow styles and border strategies.',
    component: CustomShadowsAudit,
    props: [],
    variants: [],
    layout: 'top',
  },
]
