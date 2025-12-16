import * as React from "react"
import {
  Archive,
  Inbox,
  Plus,
  Search,
  Settings,
  Bot,
  ChevronRight,
  FolderOpen,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Separator } from "@/components/ui/separator"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { WorkspaceSwitcher } from "./WorkspaceSwitcher"
import { ChatDisplay } from "./ChatDisplay"
import { SessionList } from "./SessionList"
import { Nav } from "./Nav"
import { useSession } from "@/hooks/useSession"
import type { Session, Workspace, SubAgentMetadata } from "../../../shared/types"

type ViewMode = 'inbox' | 'archive' | 'agent'

interface MailProps {
  workspaces: Workspace[]
  sessions: Session[]
  agents: SubAgentMetadata[]
  activeWorkspaceId: string | null
  defaultLayout?: number[]
  defaultCollapsed?: boolean
  navCollapsedSize?: number
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

// Union type for sorting agents and folders together alphabetically
type TreeItem =
  | { type: 'agent'; agent: SubAgentMetadata }
  | { type: 'folder'; folder: AgentFolder }

/**
 * AgentTree - Recursive component for rendering agent folder hierarchy
 *
 * Elements:
 * - Collapsible folder with FolderOpen/ChevronRight icons
 * - Vertical connector line for nested items
 * - Agent buttons with Bot icon, name, and conversation count
 */
function AgentTree({ folder, level, isCollapsed, selectedAgentId, onSelectAgent, getConversationCount }: AgentTreeProps) {
  const [isOpen, setIsOpen] = React.useState(true)

  if (isCollapsed && level > 0) return null

  // Combine agents and folders into a single sorted list
  const items: TreeItem[] = React.useMemo(() => {
    const agentItems: TreeItem[] = folder.agents.map(agent => ({ type: 'agent', agent }))
    const folderItems: TreeItem[] = folder.subfolders.map(f => ({ type: 'folder', folder: f }))
    const all = [...agentItems, ...folderItems]
    // Sort alphabetically by name, folders and agents interleaved
    all.sort((a, b) => {
      const nameA = a.type === 'agent' ? a.agent.name.split('/').pop()! : a.folder.name
      const nameB = b.type === 'agent' ? b.agent.name.split('/').pop()! : b.folder.name
      return nameA.localeCompare(nameB)
    })
    return all
  }, [folder.agents, folder.subfolders])

  // isInsideFolder: true for agents nested inside a folder (indentation handled by container)
  const renderAgent = (agent: SubAgentMetadata, _isInsideFolder: boolean) => (
    <button
      key={agent.id}
      onClick={() => onSelectAgent(agent.id, agent.name)}
      className={cn(
        "flex items-center gap-2 w-full py-1.5 px-2 hover:bg-accent rounded-md text-sm",
        selectedAgentId === agent.id && "bg-accent"
      )}
    >
      <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="truncate">{agent.name.split('/').pop()}</span>
      <span className="ml-auto text-xs text-muted-foreground/50 opacity-0 group-hover/agents:opacity-100 transition-opacity">
        {getConversationCount(agent.id)}
      </span>
    </button>
  )

  return (
    <div className={cn(level > 1 && "ml-3")}>
      {folder.name && (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger className="group flex items-center gap-2 w-full py-1.5 px-2 hover:bg-accent rounded-md text-sm">
            <div className="relative h-3.5 w-3.5 shrink-0">
              <FolderOpen className="absolute inset-0 h-3.5 w-3.5 text-muted-foreground transition-opacity group-hover:opacity-0" />
              <ChevronRight className={cn(
                "absolute inset-0 h-3.5 w-3.5 text-muted-foreground transition-opacity opacity-0 group-hover:opacity-100",
                isOpen && "rotate-90"
              )} />
            </div>
            <span className="truncate">{folder.name}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="relative">
            {/* Vertical connector line - aligned with center of chevron (px-2 + half of w-3.5) */}
            <div className="absolute left-[15px] top-0 bottom-1.5 w-px bg-border rounded-full" />
            <div className="pl-6">
              {items.map(item =>
                item.type === 'agent' ? (
                  renderAgent(item.agent, true)
                ) : (
                  <AgentTree
                    key={item.folder.path.join('/')}
                    folder={item.folder}
                    level={level + 1}
                    isCollapsed={isCollapsed}
                    selectedAgentId={selectedAgentId}
                    onSelectAgent={onSelectAgent}
                    getConversationCount={getConversationCount}
                  />
                )
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      {!folder.name && (
        <>
          {items.map(item =>
            item.type === 'agent' ? (
              renderAgent(item.agent, false)
            ) : (
              <AgentTree
                key={item.folder.path.join('/')}
                folder={item.folder}
                level={level + 1}
                isCollapsed={isCollapsed}
                selectedAgentId={selectedAgentId}
                onSelectAgent={onSelectAgent}
                getConversationCount={getConversationCount}
              />
            )
          )}
        </>
      )}
    </div>
  )
}

/**
 * Mail - Main 3-panel layout container
 *
 * Layout: [Sidebar 20%] | [Session List + Chat Display 80%]
 *         The right side is split into [Session List 40%] | [Chat Display 60%]
 *
 * View Modes:
 * - 'inbox': Shows non-archived sessions
 * - 'archive': Shows archived sessions
 * - 'agent': Shows sessions for a specific agent
 */
export function Mail({
  workspaces,
  sessions,
  agents,
  activeWorkspaceId,
  defaultLayout = [20, 32, 48],
  defaultCollapsed = false,
  navCollapsedSize = 4,
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
}: MailProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed)
  const [session, setSession] = useSession()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [viewMode, setViewMode] = React.useState<ViewMode>('inbox')
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null)

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId)

  // Count sessions by archive status
  const inboxCount = sessions.filter(s => !s.isArchived).length
  const archiveCount = sessions.filter(s => s.isArchived).length

  // Get conversation count per agent
  const getConversationCount = React.useCallback((agentId: string) => {
    return sessions.filter(s => s.agentId === agentId && !s.isArchived).length
  }, [sessions])

  // Filter sessions based on view mode, agent selection, and search
  const filteredSessions = React.useMemo(() => {
    let filtered = sessions

    // Filter by view mode
    if (viewMode === 'inbox') {
      filtered = filtered.filter(s => !s.isArchived)
    } else if (viewMode === 'archive') {
      filtered = filtered.filter(s => s.isArchived)
    } else if (viewMode === 'agent' && selectedAgentId) {
      filtered = filtered.filter(s => s.agentId === selectedAgentId && !s.isArchived)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(s => {
        const workspaceName = s.workspaceName?.toLowerCase() || ''
        const lastMessage = s.messages[s.messages.length - 1]?.content?.toLowerCase() || ''
        const agentName = s.agentName?.toLowerCase() || ''
        return workspaceName.includes(query) || lastMessage.includes(query) || agentName.includes(query)
      })
    }

    return filtered
  }, [sessions, viewMode, selectedAgentId, searchQuery])

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
                      agents.find(a => a.id === selectedAgentId)?.name || 'Conversations' :
                      'Conversations'

  return (
    <TooltipProvider delayDuration={0}>
      {/* === OUTER LAYOUT: Sidebar | Main Content === */}
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={(sizes: number[]) => {
          localStorage.setItem('mail-layout-outer', JSON.stringify(sizes))
        }}
        className="h-full items-stretch"
      >
        {/* === PANEL 1: SIDEBAR (Left) ===
            Collapsible navigation with workspace switcher, nav links, and agent tree */}
        <ResizablePanel
          defaultSize={defaultLayout[0]}
          collapsedSize={navCollapsedSize}
          collapsible={true}
          minSize={10}
          maxSize={20}
          onCollapse={() => {
            setIsCollapsed(true)
            localStorage.setItem('mail-collapsed', JSON.stringify(true))
          }}
          onResize={() => {
            setIsCollapsed(false)
            localStorage.setItem('mail-collapsed', JSON.stringify(false))
          }}
          className={cn(
            "bg-sidebar overflow-hidden min-w-0",
            isCollapsed &&
              "!min-w-12.5 transition-all duration-300 ease-in-out"
          )}
        >
          <div className="flex h-full flex-col">
            {/* Sidebar Top Section */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* WorkspaceSwitcher: Dropdown to select active workspace */}
              <div
                className={cn(
                  "flex h-[52px] items-center justify-center shrink-0",
                  isCollapsed ? "h-[52px]" : "px-2"
                )}
              >
                <WorkspaceSwitcher
                  isCollapsed={isCollapsed}
                  workspaces={workspaces}
                  activeWorkspaceId={activeWorkspaceId}
                  onSelect={onSelectWorkspace}
                />
              </div>
              <Separator />
              {/* Primary Nav: Inbox, Archive, New Chat */}
              <Nav
                isCollapsed={isCollapsed}
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
              <Separator />
              {/* Agent Tree: Hierarchical list of agents (expanded mode only) */}
              {!isCollapsed && (
                <div className="group/agents flex-1 min-h-0 flex flex-col overflow-hidden">
                  {/* Agents Section Header with Refresh button */}
                  <div className="flex items-center justify-between px-4 py-2 shrink-0">
                    <span className="text-xs font-medium text-muted-foreground">Agents</span>
                    <button
                      onClick={onRefreshAgents}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Refresh
                    </button>
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
                          isCollapsed={isCollapsed}
                          selectedAgentId={selectedAgentId}
                          onSelectAgent={handleSelectAgent}
                          getConversationCount={getConversationCount}
                        />
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}
              {/* Agents Icon: Shown when sidebar is collapsed */}
              {isCollapsed && (
                <Nav
                  isCollapsed={isCollapsed}
                  links={[
                    {
                      title: "Agents",
                      label: String(agents.length),
                      icon: Bot,
                      variant: viewMode === 'agent' ? "default" : "ghost",
                    },
                  ]}
                />
              )}
            </div>

            {/* Sidebar Bottom Section */}
            <div className="mt-auto shrink-0">
              <Separator />
              {/* Settings Nav */}
              <Nav
                isCollapsed={isCollapsed}
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
        </ResizablePanel>

        <ResizableHandle />

        {/* === PANEL 2: MAIN CONTENT (Right) ===
            Nested resizable layout: Session List | Chat Display */}
        <ResizablePanel defaultSize={defaultLayout[1] + defaultLayout[2]} minSize={45} className="overflow-hidden min-w-0">
          {/* Inner Layout: Session List (40%) | Chat Display (60%) */}
          <ResizablePanelGroup
            direction="horizontal"
            onLayout={(sizes: number[]) => {
              localStorage.setItem('mail-layout-inner', JSON.stringify(sizes))
            }}
            className="h-full"
          >
            {/* === SESSION LIST PANEL === */}
            <ResizablePanel defaultSize={40} minSize={25} className="overflow-hidden min-w-0">
              <div className="h-full flex flex-col min-w-0">
                {/* Header: Dynamic title (Conversations/Archive/Agent name) */}
                <div className="flex h-[52px] items-center px-4 min-w-0">
                  <h1 className="text-xl font-bold truncate">{listTitle}</h1>
                </div>
                <Separator />
                {/* Search Bar: Filters by workspace, message, or agent name */}
                <div className="bg-background/95 p-4 backdrop-blur supports-backdrop-filter:bg-background/60 min-w-0">
                  <form>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Search"
                        className="pl-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </form>
                </div>
                {/* SessionList: Scrollable list of session cards */}
                <SessionList
                  items={filteredSessions}
                  onDelete={onDeleteSession}
                  onArchive={viewMode !== 'archive' ? onArchiveSession : undefined}
                  onUnarchive={viewMode === 'archive' ? onUnarchiveSession : undefined}
                />
              </div>
            </ResizablePanel>

            <ResizableHandle />

            {/* === CHAT DISPLAY PANEL === */}
            <ResizablePanel defaultSize={60} minSize={35} className="overflow-hidden min-w-0">
              <ChatDisplay
                session={selectedSession}
                onSendMessage={(message) => selectedSession && onSendMessage(selectedSession.id, message)}
                onOpenFile={onOpenFile}
                onOpenUrl={onOpenUrl}
                onDelete={() => selectedSession && onDeleteSession(selectedSession.id)}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  )
}
