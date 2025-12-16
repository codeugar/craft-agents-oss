import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface NavProps {
  isCollapsed: boolean
  links: {
    title: string
    label?: string       // Optional badge (e.g., count)
    icon: LucideIcon
    variant: "default" | "ghost"  // "default" = highlighted, "ghost" = subtle
    onClick?: () => void
  }[]
}

/**
 * Nav - Vertical list of navigation buttons with icons
 *
 * Renders differently based on collapsed state:
 * - Expanded: Full button with icon, title, and optional label badge
 * - Collapsed: Icon-only button wrapped in Tooltip (shows title + label on hover)
 *
 * Link variants:
 * - "default": Highlighted style (used for active/selected items)
 * - "ghost": Subtle style (used for inactive items)
 */
export function Nav({ links, isCollapsed }: NavProps) {
  return (
    <div
      data-collapsed={isCollapsed}
      className="group flex flex-col gap-4 py-2 data-[collapsed=true]:py-2"
    >
      <nav className="grid gap-1 px-2 group-data-[collapsed=true]:justify-center group-data-[collapsed=true]:px-2">
        {links.map((link, index) =>
          isCollapsed ? (
            /* Collapsed Mode: Icon-only button with Tooltip */
            <Tooltip key={index} delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={link.onClick}
                  className={cn(
                    buttonVariants({ variant: link.variant, size: "icon" }),
                    "h-10 w-10",
                    link.variant === "default" &&
                      "dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
                  )}
                >
                  <link.icon className="h-5 w-5" />
                  <span className="sr-only">{link.title}</span>
                </button>
              </TooltipTrigger>
              {/* Tooltip: Shows title + label on hover */}
              <TooltipContent side="right" className="flex items-center gap-4">
                {link.title}
                {link.label && (
                  <span className="ml-auto text-muted-foreground">
                    {link.label}
                  </span>
                )}
              </TooltipContent>
            </Tooltip>
          ) : (
            /* Expanded Mode: Full button with icon, title, and label */
            <button
              key={index}
              onClick={link.onClick}
              className={cn(
                buttonVariants({ variant: link.variant, size: "default" }),
                link.variant === "default" &&
                  "dark:bg-muted dark:text-foreground dark:hover:bg-muted dark:hover:text-foreground",
                "justify-start"
              )}
            >
              <link.icon className="mr-2 h-5 w-5" />
              {link.title}
              {/* Label Badge: Shows count or status on the right */}
              {link.label && (
                <span
                  className={cn(
                    "ml-auto",
                    link.variant === "default" &&
                      "text-background dark:text-foreground"
                  )}
                >
                  {link.label}
                </span>
              )}
            </button>
          )
        )}
      </nav>
    </div>
  )
}
