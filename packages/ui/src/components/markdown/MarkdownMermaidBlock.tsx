import * as React from 'react'
import { renderMermaid } from '@craft-agent/mermaid'
import { CodeBlock } from './CodeBlock'

// ============================================================================
// MarkdownMermaidBlock — renders mermaid code fences as SVG diagrams.
//
// Uses @craft-agent/mermaid to parse flowchart text and produce an SVG string.
// Falls back to a plain code block if rendering fails (invalid syntax, etc).
//
// The SVG uses CSS custom properties (--bg, --fg) for theming. When no colors
// are provided, defaults apply (white bg, dark fg). Parent elements can
// override colors by setting CSS variables, which cascade into the inline SVG.
// ============================================================================

interface MarkdownMermaidBlockProps {
  code: string
  className?: string
}

export function MarkdownMermaidBlock({ code, className }: MarkdownMermaidBlockProps) {
  const [svg, setSvg] = React.useState<string | null>(null)
  const [error, setError] = React.useState<Error | null>(null)

  React.useEffect(() => {
    let cancelled = false

    // Render with default colors — the SVG uses CSS custom properties that
    // can be overridden by parent elements if needed (e.g. --bg, --fg).
    renderMermaid(code)
      .then(result => {
        if (!cancelled) setSvg(result)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)))
      })

    return () => { cancelled = true }
  }, [code])

  // On error, fall back to a plain code block showing the mermaid source
  if (error) {
    return <CodeBlock code={code} language="mermaid" mode="full" className={className} />
  }

  // Loading state: show the code block until SVG is ready
  if (!svg) {
    return <CodeBlock code={code} language="mermaid" mode="full" className={className} />
  }

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ overflow: 'auto' }}
    />
  )
}
