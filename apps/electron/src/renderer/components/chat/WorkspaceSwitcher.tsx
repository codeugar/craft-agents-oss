import * as React from "react"
import { useState } from "react"
import { Check, FolderPlus } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
} from "@/components/ui/styled-dropdown"
import { CrossfadeAvatar } from "@/components/ui/avatar"
import { FadingText } from "@/components/ui/fading-text"
import type { Workspace } from "../../../shared/types"

interface WorkspaceSwitcherProps {
  isCollapsed: boolean
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onSelect: (workspaceId: string) => void
  onWorkspaceCreated?: (workspace: Workspace) => void
}

/**
 * WorkspaceSwitcher - Dropdown to select active workspace
 *
 * Elements:
 * - Trigger: Button showing current workspace avatar + name
 * - Avatar: Circular badge with first letter of workspace name
 * - Content: Dropdown menu listing all workspaces
 * - Item: Individual workspace option (avatar + name + checkmark if selected)
 *
 * When sidebar is collapsed: Shows only the avatar (icon-only mode)
 */
export function WorkspaceSwitcher({
  isCollapsed,
  workspaces,
  activeWorkspaceId,
  onSelect,
  onWorkspaceCreated,
}: WorkspaceSwitcherProps) {
  const [isCreating, setIsCreating] = useState(false)
  const selectedWorkspace = workspaces.find(w => w.id === activeWorkspaceId)

  const handleNewWorkspace = async () => {
    if (isCreating) return
    setIsCreating(true)

    try {
      // Open folder picker
      const folderPath = await window.electronAPI.openFolderDialog()
      if (!folderPath) {
        setIsCreating(false)
        return
      }

      // Use folder name as workspace name (browser-compatible basename)
      const name = folderPath.split(/[\\/]/).pop() || folderPath

      // Create workspace
      const workspace = await window.electronAPI.createWorkspace(folderPath, name)
      toast.success(`Created workspace "${name}"`)

      // Notify parent
      onWorkspaceCreated?.(workspace)
      onSelect(workspace.id)
    } catch (error) {
      console.error('Failed to create workspace:', error)
      toast.error('Failed to create workspace')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <DropdownMenu>
      {/* Trigger Button: Shows current workspace
          Hover effect: subtle background tint */}
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1 w-full min-w-0 justify-start px-2 py-1.5 rounded-md",
            "text-foreground hover:bg-foreground/5 data-[state=open]:bg-foreground/5 transition-colors duration-150",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            isCollapsed && "h-9 w-9 shrink-0 justify-center p-0"
          )}
          aria-label="Select workspace"
        >
          {/* Workspace Avatar: Image with crossfade, border, first letter fallback */}
          <CrossfadeAvatar
            src={selectedWorkspace?.iconUrl}
            alt={selectedWorkspace?.name}
            className="h-4 w-4 ring-1 ring-border/50"
            fallbackClassName="bg-primary text-primary-foreground text-[10px]"
            fallback={selectedWorkspace?.name?.charAt(0) || 'W'}
          />
          {/* Workspace Name: Hidden when collapsed, gradient fade on overflow */}
          {!isCollapsed && (
            <FadingText className="ml-1 font-sans min-w-0 text-sm" fadeWidth={36}>
              {selectedWorkspace?.name || 'Select workspace'}
            </FadingText>
          )}
        </button>
      </DropdownMenuTrigger>
      {/* Dropdown Content: List of all workspaces */}
      <StyledDropdownMenuContent align="start" sideOffset={4}>
        {workspaces.map((workspace) => (
          <StyledDropdownMenuItem
            key={workspace.id}
            onClick={() => onSelect(workspace.id)}
            className={cn(
              "justify-between",
              activeWorkspaceId === workspace.id && "bg-foreground/10"
            )}
          >
            <div className="flex items-center gap-3 font-sans">
              <CrossfadeAvatar
                src={workspace.iconUrl}
                alt={workspace.name}
                className="h-5 w-5 ring-1 ring-border/50"
                fallbackClassName="bg-muted text-xs"
                fallback={workspace.name.charAt(0)}
              />
              {workspace.name}
            </div>
            {activeWorkspaceId === workspace.id && (
              <Check className="h-3.5 w-3.5 ml-2" />
            )}
          </StyledDropdownMenuItem>
        ))}

        {/* Separator and New Workspace option */}
        <StyledDropdownMenuSeparator />
        <StyledDropdownMenuItem
          onClick={handleNewWorkspace}
          disabled={isCreating}
          className="font-sans"
        >
          <FolderPlus className="h-4 w-4 mr-3" />
          {isCreating ? 'Creating...' : 'New Workspace...'}
        </StyledDropdownMenuItem>
      </StyledDropdownMenuContent>
    </DropdownMenu>
  )
}
