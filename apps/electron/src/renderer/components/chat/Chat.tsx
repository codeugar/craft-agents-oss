import * as React from "react"
import { useRef, useState, useEffect } from "react"
import { motion } from "motion/react"
import {
  Archive,
  Inbox,
  Plus,
  Settings,
  Bot,
  ChevronRight,
  FolderOpen,
  PanelLeft,
  MoreHorizontal,
  RotateCw,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { GradientResizeHandle } from "@/components/ui/gradient-resize-handle"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Collapsible,
  CollapsibleTrigger,
  AnimatedCollapsibleContent,
  springTransition as collapsibleSpring,
} from "@/components/ui/collapsible"
import { WorkspaceSwitcher } from "./WorkspaceSwitcher"
import { ChatDisplay } from "./ChatDisplay"
import { SessionList } from "./SessionList"
import { LeftSidebar } from "./LeftSidebar"
import { useSession } from "@/hooks/useSession"
import { getResizeGradientStyle } from "@/hooks/useResizeGradient"
import type { Session, Workspace, SubAgentMetadata } from "../../../shared/types"

type ViewMode = 'inbox' | 'archive' | 'agent'

interface ChatProps {
  workspaces: Workspace[]
  sessions: Session[]
  agents: SubAgentMetadata[]
  activeWorkspaceId: string | null
  defaultLayout?: number[]
  defaultCollapsed?: boolean
  onSelectWorkspace: (id: string) => void
  onCreateSession: (workspaceId: string, agentId?: string) => void
  onDeleteSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onUnarchiveSession: (sessionId: string) => void
  onSendMessage: (sessionId: string, message: string) => void
  onOpenFile: (path: string) => void
  onOpenUrl: (url: string) => void
  onOpenSettings: () => void
  onRefreshAgents: () => void
}

/**
 * AgentFolder - Hierarchical structure for organizing agents
 * Agents can be nested in folders up to 3 levels deep
 */
interface AgentFolder {
  name: string                    // Folder name (empty string for root)
  path: string[]                  // Full path from root
  agents: SubAgentMetadata[]      // Agents directly in this folder
  subfolders: AgentFolder[]       // Nested folders
}

/**
 * Groups flat agent list into hierarchical folder structure
 * Uses agent.folderPath to determine nesting
 */
function groupAgentsByFolder(agents: SubAgentMetadata[]): AgentFolder {
  const root: AgentFolder = { name: '', path: [], agents: [], subfolders: [] }

  for (const agent of agents) {
    const folderPath = agent.folderPath || []
    let current = root

    for (const folderName of folderPath) {
      let subfolder = current.subfolders.find(f => f.name === folderName)
      if (!subfolder) {
        subfolder = {
          name: folderName,
          path: [...current.path, folderName],
          agents: [],
          subfolders: []
        }
        current.subfolders.push(subfolder)
      }
      current = subfolder
    }

    current.agents.push(agent)
  }

  return root
}

interface AgentTreeProps {
  folder: AgentFolder
  level: number
  isCollapsed: boolean
  selectedAgentId: string | null
  onSelectAgent: (agentId: string, agentName: string) => void
  getConversationCount: (agentId: string) => number
}

/**
 * FadingText - Text that fades with gradient only when overflowing
 */
function FadingText({
  children,
  className,
  fadeWidth = 24
}: {
  children: React.ReactNode
  className?: string
  fadeWidth?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const checkOverflow = () => {
      setIsOverflowing(el.scrollWidth > el.clientWidth)
    }

    checkOverflow()

    const observer = new ResizeObserver(checkOverflow)
    observer.observe(el)

    return () => observer.disconnect()
  }, [children])

  return (
    <span
      ref={ref}
      className={cn(
        "min-w-0 overflow-hidden whitespace-nowrap",
        className
      )}
      style={isOverflowing ? {
        maskImage: `linear-gradient(to right, black calc(100% - ${fadeWidth}px), transparent)`
      } : undefined}
    >
      {children}
    </span>
  )
}

// Union type for sorting agents and folders together alphabetically
type TreeItem =
  | { type: 'agent'; agent: SubAgentMetadata }
  | { type: 'folder'; folder: AgentFolder }

/**
 * AgentTree - Recursive component for rendering agent folder hierarchy
 *
 * Follows shadcn/ui Sidebar component patterns for proper width handling:
 * - Container: flex min-w-0 flex-col (allows shrinking)
 * - Buttons: overflow-hidden + [&>span:last-child]:truncate (clips text)
 * - Nested: border-l for vertical line, ml-* for indentation
 */
function AgentTree({ folder, level, isCollapsed, selectedAgentId, onSelectAgent, getConversationCount }: AgentTreeProps) {
  const [isOpen, setIsOpen] = React.useState(true)

  if (isCollapsed && level > 0) return null

  // Combine agents and folders: agents first (alphabetically), then folders (alphabetically)
  const items: TreeItem[] = React.useMemo(() => {
    const agentItems: TreeItem[] = folder.agents
      .map(agent => ({ type: 'agent' as const, agent }))
      .sort((a, b) => {
        const nameA = a.agent.name.split('/').pop()!
        const nameB = b.agent.name.split('/').pop()!
        return nameA.localeCompare(nameB)
      })
    const folderItems: TreeItem[] = folder.subfolders
      .map(f => ({ type: 'folder' as const, folder: f }))
      .sort((a, b) => a.folder.name.localeCompare(b.folder.name))
    return [...agentItems, ...folderItems]
  }, [folder.agents, folder.subfolders])

  // Render agent button - min-w-0 on li and span allows proper truncation
  // Selection style matches LeftSidebar "default" variant
  const isSelected = (agentId: string) => selectedAgentId === agentId
  const renderAgentItem = (agent: SubAgentMetadata) => (
    <li key={agent.id} className="min-w-0">
      <button
        onClick={() => onSelectAgent(agent.id, agent.name)}
        className={cn(
          "flex w-full items-center gap-2 overflow-hidden rounded-md py-[6px] px-2 text-sm select-none",
          isSelected(agent.id)
            ? "bg-primary text-primary-foreground dark:bg-muted dark:text-foreground"
            : "hover:bg-foreground/5"
        )}
      >
        <FadingText>
          {agent.displayName || agent.name.split('/').pop()}
        </FadingText>
        <span className={cn(
          "ml-auto shrink-0 text-xs opacity-0 group-hover/agents:opacity-100 transition-opacity",
          isSelected(agent.id) ? "text-primary-foreground/50 dark:text-foreground/50" : "text-muted-foreground/50"
        )}>
          {getConversationCount(agent.id)}
        </span>
      </button>
    </li>
  )

  // Render folder with collapsible children - shadcn SidebarMenuSub pattern
  const renderFolderItem = (subFolder: AgentFolder) => (
    <AgentTree
      key={subFolder.path.join('/')}
      folder={subFolder}
      level={level + 1}
      isCollapsed={isCollapsed}
      selectedAgentId={selectedAgentId}
      onSelectAgent={onSelectAgent}
      getConversationCount={getConversationCount}
    />
  )

  // Root level (no folder name) - render as flat list
  // Uses grid like LeftSidebar component - grid children respect container width automatically
  if (!folder.name) {
    return (
      <ul className="grid gap-0.5">
        {items.map(item =>
          item.type === 'agent' ? renderAgentItem(item.agent) : renderFolderItem(item.folder)
        )}
      </ul>
    )
  }

  // Folder level - render with collapsible and nested list
  return (
    <li className="min-w-0">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger
          className="group flex w-full items-center gap-2 overflow-hidden rounded-md py-1.5 px-2 text-sm hover:bg-foreground/[0.03] select-none"
        >
          <div className="relative h-3.5 w-3.5 shrink-0">
            <FolderOpen className="absolute inset-0 h-3.5 w-3.5 text-muted-foreground transition-opacity group-hover:opacity-0" />
            <motion.div
              initial={false}
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={collapsibleSpring}
              className="absolute inset-0"
            >
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-opacity opacity-0 group-hover:opacity-100" />
            </motion.div>
          </div>
          <FadingText>
            {folder.name}
          </FadingText>
        </CollapsibleTrigger>
        <AnimatedCollapsibleContent isOpen={isOpen}>
          {/* Nested list - uses grid + border-l for line, ml/pl for indent */}
          {/* ml-[15px] aligns border-l with icon center: px-2 (8px) + half of w-3.5 (7px) = 15px */}
          <ul className="ml-[15px] grid gap-0.5 border-l border-foreground/10 pl-3 pt-0.5">
            {items.map(item =>
              item.type === 'agent' ? renderAgentItem(item.agent) : renderFolderItem(item.folder)
            )}
          </ul>
        </AnimatedCollapsibleContent>
      </Collapsible>
    </li>
  )
}

/**
 * Chat - Main 3-panel layout container
 *
 * Layout: [Sidebar 20%] | [Session List + Chat Display 80%]
 *         The right side is split into [Session List 40%] | [Chat Display 60%]
 *
 * View Modes:
 * - 'inbox': Shows non-archived sessions
 * - 'archive': Shows archived sessions
 * - 'agent': Shows sessions for a specific agent
 */
export function Chat({
  workspaces,
  sessions,
  agents,
  activeWorkspaceId,
  defaultLayout = [20, 32, 48],
  defaultCollapsed = false,
  onSelectWorkspace,
  onCreateSession,
  onDeleteSession,
  onArchiveSession,
  onUnarchiveSession,
  onSendMessage,
  onOpenFile,
  onOpenUrl,
  onOpenSettings,
  onRefreshAgents,
}: ChatProps) {
  const [isSidebarVisible, setIsSidebarVisible] = React.useState(!defaultCollapsed)
  const [sidebarWidth, setSidebarWidth] = React.useState(() => {
    const saved = localStorage.getItem('chat-sidebar-width')
    return saved ? Number(saved) : 260
  })
  const [isResizing, setIsResizing] = React.useState(false)
  const [resizeHandleY, setResizeHandleY] = React.useState<number | null>(null)
  const resizeHandleRef = React.useRef<HTMLDivElement>(null)
  const [session, setSession] = useSession()
  const [viewMode, setViewMode] = React.useState<ViewMode>('inbox')
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null)

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId)

  // Sidebar resize handlers
  const handleResizeStart = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  // Track mouse position on resize handle for gradient effect
  const handleResizeHandleMouseMove = React.useCallback((e: React.MouseEvent) => {
    if (resizeHandleRef.current) {
      const rect = resizeHandleRef.current.getBoundingClientRect()
      setResizeHandleY(e.clientY - rect.top)
    }
  }, [])

  const handleResizeHandleMouseLeave = React.useCallback(() => {
    if (!isResizing) {
      setResizeHandleY(null)
    }
  }, [isResizing])

  React.useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(Math.max(e.clientX, 200), 400)
      setSidebarWidth(newWidth)
      // Update gradient position during drag
      if (resizeHandleRef.current) {
        const rect = resizeHandleRef.current.getBoundingClientRect()
        setResizeHandleY(e.clientY - rect.top)
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      setResizeHandleY(null)
      localStorage.setItem('chat-sidebar-width', String(sidebarWidth))
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, sidebarWidth])

  // Spring transition config - shared between sidebar and header
  // Critical damping (no bounce): damping = 2 * sqrt(stiffness * mass)
  const springTransition = {
    type: "spring" as const,
    stiffness: 600,
    damping: 49,
  }

  // Count sessions by archive status
  const inboxCount = sessions.filter(s => !s.isArchived).length
  const archiveCount = sessions.filter(s => s.isArchived).length

  // Get conversation count per agent
  const getConversationCount = React.useCallback((agentId: string) => {
    return sessions.filter(s => s.agentId === agentId && !s.isArchived).length
  }, [sessions])

  // Filter sessions based on view mode and agent selection
  const filteredSessions = React.useMemo(() => {
    if (viewMode === 'inbox') {
      return sessions.filter(s => !s.isArchived)
    } else if (viewMode === 'archive') {
      return sessions.filter(s => s.isArchived)
    } else if (viewMode === 'agent' && selectedAgentId) {
      return sessions.filter(s => s.agentId === selectedAgentId && !s.isArchived)
    }
    return sessions
  }, [sessions, viewMode, selectedAgentId])

  const selectedSession = sessions.find(s => s.id === session.selected) || null

  // Group agents for tree view
  const agentTree = React.useMemo(() => groupAgentsByFolder(agents), [agents])

  const handleSelectAgent = (agentId: string, _agentName: string) => {
    setSelectedAgentId(agentId)
    setViewMode('agent')
  }

  const handleInboxClick = () => {
    setViewMode('inbox')
    setSelectedAgentId(null)
    setSession({ selected: null })
  }

  const handleArchiveClick = () => {
    setViewMode('archive')
    setSelectedAgentId(null)
    setSession({ selected: null })
  }

  // Get title based on view mode
  const listTitle = viewMode === 'archive' ? 'Archive' :
                    viewMode === 'agent' && selectedAgentId ?
                      (agents.find(a => a.id === selectedAgentId)?.displayName || agents.find(a => a.id === selectedAgentId)?.name || 'Inbox') :
                      'Inbox'

  return (
    <TooltipProvider delayDuration={0}>
      {/*
        Draggable title bar region for transparent window (macOS)
        - Fixed overlay at z-40 allows window dragging from the top bar area
        - Interactive elements (buttons, dropdowns) must use:
          1. titlebar-no-drag: prevents drag behavior on clickable elements
          2. relative z-50: ensures elements render above this drag overlay
      */}
      <div className="titlebar-drag-region fixed top-0 left-0 right-0 h-[50px] z-40" />

      {/* Sidebar Toggle Button - fixed position, animated opacity */}
      <motion.div
        initial={false}
        animate={{ opacity: isSidebarVisible ? 0 : 1 }}
        transition={{ duration: 0.15 }}
        className="fixed left-[86px] top-[13px] z-[60]"
        style={{ pointerEvents: isSidebarVisible ? 'none' : 'auto' }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsSidebarVisible(true)}
          className="h-7 w-7 titlebar-no-drag hover:bg-foreground/5"
        >
          <PanelLeft className="!h-5 !w-5 -translate-y-px" />
        </Button>
      </motion.div>

      {/* === OUTER LAYOUT: Sidebar | Main Content === */}
      <div className="h-full flex items-stretch relative">
        {/* === SIDEBAR (Left) ===
            Animated width with spring physics for smooth 60-120fps transitions.
            Uses overflow-hidden to clip content during collapse animation.
            Resizable via drag handle on right edge (200-400px range). */}
        <motion.div
          initial={false}
          animate={{ width: isSidebarVisible ? sidebarWidth : 0 }}
          transition={isResizing ? { duration: 0 } : springTransition}
          className="h-full overflow-hidden shrink-0 relative"
        >
          <div style={{ width: sidebarWidth }} className="h-full bg-sidebar font-sans relative">
            {/* Header row: WorkspaceSwitcher + Toggle Button */}
            <div className="absolute top-0 left-0 right-0 h-[50px] flex items-center pl-[78px] pr-2 gap-1 z-50 titlebar-no-drag">
              <div className="flex-1 min-w-0 overflow-hidden">
                <WorkspaceSwitcher
                  isCollapsed={false}
                  workspaces={workspaces}
                  activeWorkspaceId={activeWorkspaceId}
                  onSelect={onSelectWorkspace}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarVisible(false)}
                className="h-7 w-7 shrink-0 hover:bg-foreground/5"
              >
                <PanelLeft className="!h-5 !w-5 -translate-y-px" />
              </Button>
            </div>
            <div className="flex h-full flex-col pt-[50px]">
              {/* Sidebar Top Section */}
              <div className="flex-1 flex flex-col min-h-0">
                {/* Primary Nav: Inbox, Archive, New Chat */}
                <LeftSidebar
                  isCollapsed={false}
                  links={[
                    {
                      title: "Inbox",
                      label: String(inboxCount),  // Badge: non-archived count
                      icon: Inbox,
                      variant: viewMode === 'inbox' ? "default" : "ghost",
                      onClick: handleInboxClick,
                    },
                    {
                      title: "Archive",
                      label: String(archiveCount),  // Badge: archived count
                      icon: Archive,
                      variant: viewMode === 'archive' ? "default" : "ghost",
                      onClick: handleArchiveClick,
                    },
                    {
                      title: "New Chat",
                      label: "",
                      icon: Plus,
                      variant: "ghost",
                      onClick: () => activeWorkspace && onCreateSession(activeWorkspace.id, selectedAgentId || undefined),
                    },
                  ]}
                />
                <Separator className="bg-foreground/10" />
                {/* Agent Tree: Hierarchical list of agents */}
                <div className="group/agents flex-1 min-h-0 flex flex-col overflow-hidden pt-0.5">
                  {/* Agents Section Header with menu */}
                  <div className="flex items-center justify-between pl-4 pr-2 py-2 shrink-0">
                    <span className="text-xs font-medium text-muted-foreground">Agents</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 rounded hover:bg-foreground/5 text-muted-foreground hover:text-foreground">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-0 animate-none data-[state=open]:animate-none data-[state=closed]:animate-none">
                        <DropdownMenuItem onClick={onRefreshAgents} className="text-sm font-sans">
                          <RotateCw className="!size-3.5 mr-2" />
                          Refresh
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {/* Scrollable Agent Tree */}
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="px-2 pb-2">
                      {agents.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-2 py-4">
                          No agents found. Create an "Agents" folder in your Craft space.
                        </p>
                      ) : (
                        <AgentTree
                          folder={agentTree}
                          level={0}
                          isCollapsed={false}
                          selectedAgentId={selectedAgentId}
                          onSelectAgent={handleSelectAgent}
                          getConversationCount={getConversationCount}
                        />
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>

              {/* Sidebar Bottom Section */}
              <div className="mt-auto shrink-0">
                <Separator className="bg-foreground/10" />
                {/* Settings Nav */}
                <LeftSidebar
                  isCollapsed={false}
                  links={[
                    {
                      title: "Settings",
                      label: "",
                      icon: Settings,
                      variant: "ghost",
                      onClick: onOpenSettings,
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Resize Handle - OUTSIDE sidebar so it's not clipped by overflow-hidden
            Touch area: 12px wide (±6px from edge)
            Visual: 2px wide gradient centered in touch area */}
        <div
          ref={resizeHandleRef}
          onMouseDown={handleResizeStart}
          onMouseMove={handleResizeHandleMouseMove}
          onMouseLeave={handleResizeHandleMouseLeave}
          className="absolute top-0 w-3 h-full cursor-col-resize z-50 flex justify-center"
          style={{
            left: isSidebarVisible ? sidebarWidth - 6 : -6,
            transition: isResizing ? undefined : 'left 0.15s ease-out',
          }}
        >
          {/* Visual indicator - 2px wide */}
          <div
            className="w-0.5 h-full"
            style={getResizeGradientStyle(resizeHandleY)}
          />
        </div>

        {/* === MAIN CONTENT (Right) ===
            Nested resizable layout: Session List | Chat Display */}
        <div className="flex-1 overflow-hidden min-w-0">
          {/* Inner Layout: Session List (40%) | Chat Display (60%) */}
          <ResizablePanelGroup
            direction="horizontal"
            onLayout={(sizes: number[]) => {
              localStorage.setItem('chat-layout-inner', JSON.stringify(sizes))
            }}
            className="h-full"
          >
            {/* === SESSION LIST PANEL === */}
            <ResizablePanel defaultSize={40} minSize={25} className="overflow-hidden min-w-0">
              <div className="h-full flex flex-col min-w-0 bg-background">
                {/* Header: Dynamic title (Conversations/Archive/Agent name)
                    Animated margin when sidebar toggles - uses same spring curve */}
                <motion.div
                  initial={false}
                  animate={{ marginLeft: isSidebarVisible ? 0 : 102 }}
                  transition={springTransition}
                  className="flex h-[50px] shrink-0 flex-col justify-center pl-5 pr-4 min-w-0 relative z-50"
                >
                  <h1 className="text-sm font-semibold truncate font-sans leading-tight">{listTitle}</h1>
                  <p className="text-[11px] opacity-50 font-sans leading-tight">{filteredSessions.length} conversations</p>
                </motion.div>
                <Separator />
                {/* SessionList: Scrollable list of session cards */}
                <SessionList
                  items={filteredSessions}
                  onDelete={onDeleteSession}
                  onArchive={viewMode !== 'archive' ? onArchiveSession : undefined}
                  onUnarchive={viewMode === 'archive' ? onUnarchiveSession : undefined}
                />
              </div>
            </ResizablePanel>

            <GradientResizeHandle />

            {/* === CHAT DISPLAY PANEL === */}
            <ResizablePanel defaultSize={60} minSize={35} className="overflow-hidden min-w-0 bg-background">
              <ChatDisplay
                session={selectedSession}
                onSendMessage={(message) => selectedSession && onSendMessage(selectedSession.id, message)}
                onOpenFile={onOpenFile}
                onOpenUrl={onOpenUrl}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </TooltipProvider>
  )
}
