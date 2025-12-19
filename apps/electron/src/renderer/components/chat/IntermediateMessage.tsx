import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleTrigger, AnimatedCollapsibleContent } from '@/components/ui/collapsible'
import { Markdown } from '@/components/markdown'
import { cn } from '@/lib/utils'

interface IntermediateMessageProps {
  content: string
  onOpenUrl?: (url: string) => void
  onOpenFile?: (path: string) => void
}

/**
 * IntermediateMessage - Collapsible display for intermediate agent commentary
 *
 * When the agent calls tools in a loop, it emits text between tool calls
 * (e.g., "Let me search for that..."). These are intermediate messages,
 * not final output. This component displays them collapsed by default
 * with muted styling to distinguish from final responses.
 */
export function IntermediateMessage({ content, onOpenUrl, onOpenFile }: IntermediateMessageProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Generate a short summary for the collapsed state
  // Take first line or first ~50 chars
  const summary = content.split('\n')[0].slice(0, 60) + (content.length > 60 ? '...' : '')

  return (
    <div className="flex justify-start">
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="max-w-[80%]">
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2",
              "text-xs text-muted-foreground",
              "hover:bg-muted/50 transition-colors",
              "cursor-pointer select-none"
            )}
          >
            <ChevronRight
              className={cn(
                "h-3 w-3 shrink-0 transition-transform duration-200",
                isOpen && "rotate-90"
              )}
            />
            <span className="truncate">{isOpen ? 'Thinking...' : summary}</span>
          </button>
        </CollapsibleTrigger>

        <AnimatedCollapsibleContent isOpen={isOpen} className="overflow-hidden">
          <div className="bg-muted/30 rounded-lg px-4 py-2 mt-1 ml-5 border-l-2 border-muted">
            <Markdown
              mode="minimal"
              onUrlClick={onOpenUrl}
              onFileClick={onOpenFile}
              className="text-xs text-muted-foreground"
            >
              {content}
            </Markdown>
          </div>
        </AnimatedCollapsibleContent>
      </Collapsible>
    </div>
  )
}
