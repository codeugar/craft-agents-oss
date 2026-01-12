# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Important:** Keep this file and `README.md` up-to-date whenever functionality changes. After making changes to this package, update the documentation to reflect the current state.

## Overview

This is the Electron desktop app for Craft Agent - a GUI alternative to the TUI. It provides a multi-threaded chat interface for interacting with Claude via Craft workspaces.

**Note:** This app reuses the `@craft-agent/shared` package for core business logic. Dependencies are managed in the root `package.json`.

## UI Components

**Always use shadcn/ui components** for building the UI. Never create custom button, input, or other primitive components - use the existing shadcn components from `@/components/ui/`.

Available components in `src/renderer/components/ui/`:
- `avatar`, `avatar-group`, `badge`, `button`, `collapsible`, `source-avatar`, `dialog`, `dropdown-menu`
- `input`, `kbd`, `label`, `loading-indicator`, `popover`, `resizable`, `scroll-area`
- `select`, `separator`, `service-logo`, `sonner`, `switch`, `tabs`, `textarea`, `tooltip`

To add new shadcn components:
```bash
# From project root - ALWAYS use @latest for Tailwind CSS v4 compatibility
cd apps/electron && npx shadcn@latest add <component-name>
```

Icons: Use [Lucide React](https://lucide.dev/icons/) (`lucide-react` package).

### Loading Indicators

**Always use `Spinner` or `LoadingIndicator`** for loading states. Never use `Loader2` from lucide-react or `animate-spin` classes.

```tsx
import { Spinner, LoadingIndicator } from "@/components/ui/loading-indicator"

// Simple spinner - inherits size and color from parent
<Spinner />

// Control size via text-* classes (uses 1em sizing)
<Spinner className="text-sm" />   // Small
<Spinner className="text-lg" />   // Large
<Spinner className="text-2xl" />  // Extra large

// Control color via text-* classes (uses currentColor)
<Spinner className="text-muted-foreground" />
<Spinner className="text-amber-500" />

// Or inherit from parent element
<div className="text-muted-foreground text-sm">
  <Spinner />  {/* Inherits size and color */}
</div>

// Full loading indicator with label
<LoadingIndicator label="Loading..." />
<LoadingIndicator label="Thinking..." showElapsed />  // With elapsed time
<LoadingIndicator ultrathink />                       // Gradient animation
```

The spinner is based on [SpinKit Grid](https://github.com/tobiasahlin/SpinKit):
- 3x3 grid of cubes with staggered scale animation
- Scales with font-size (uses `em` units)
- Uses `currentColor` (inherits text color)
- Pure CSS animation (no JS state needed)
- CSS defined in `index.css` (`.spinner` class)

### Source Avatars

**Always use `SourceAvatar`** for displaying source icons (MCP servers, APIs, Gmail, local sources). Never use `ServiceLogo` directly or create custom avatar implementations.

```tsx
import { SourceAvatar } from "@/components/ui/source-avatar"

// Pattern 1: Direct props - for MCP servers and APIs
<SourceAvatar
  type="mcp"           // 'mcp' | 'api' | 'gmail' | 'local'
  name="My Server"     // Alt text
  logoUrl={server.logo} // Google Favicon URL (optional)
  size="md"            // 'xs' | 'sm' | 'md' | 'lg'
/>

// Derive logo from service URL (no logoUrl needed)
<SourceAvatar
  type="api"
  name="GitHub API"
  serviceUrl="https://api.github.com"  // Will generate favicon URL
  size="lg"
/>

// Pattern 2: Source object - for LoadedSource objects (sidebar, source lists)
import type { LoadedSource } from '../../../../shared/types'

<SourceAvatar source={loadedSource} size="sm" />

// In sidebar source lists
{sources.map((source: LoadedSource) => (
  <SourceAvatar source={source} size="sm" />
))}
```

**Size variants:**
| Size | Dimensions | Use case |
|------|------------|----------|
| `xs` | 14x14 | Inline, compact lists |
| `sm` | 16x16 | Sidebar source list, dropdowns, avatar groups |
| `md` | 20x20 | Auth steps, setup flows |
| `lg` | 24x24 | Info panels, detail views |

**Automatic fallback icons by type:**
- `mcp` → MCP icon (plug-like)
- `api` → Globe icon
- `gmail` → Mail icon
- `local` → HardDrive icon

**Features:**
- Consistent ring border styling (`ring-1 ring-border/30`)
- Smooth crossfade from fallback to loaded image
- Auto-derives favicon URL from `serviceUrl` or `LoadedSource` config
- Uses Google Favicon API for logos

### Keyboard Shortcuts

**Always use `Kbd` and `KbdGroup`** for displaying keyboard shortcuts. Never use plain text or custom styled spans.

```tsx
import { Kbd, KbdGroup } from "@/components/ui/kbd"

// Single key
<Kbd>⌘</Kbd>
<Kbd>Enter</Kbd>
<Kbd>Esc</Kbd>

// Key combination (use KbdGroup)
<KbdGroup>
  <Kbd>⌘</Kbd>
  <Kbd>K</Kbd>
</KbdGroup>

// In dropdown menus (common pattern)
<DropdownMenuItem>
  <span>New Chat</span>
  <KbdGroup className="ml-auto">
    <Kbd>⌘</Kbd>
    <Kbd>N</Kbd>
  </KbdGroup>
</DropdownMenuItem>

// In tooltips (automatically adapts styling)
<Tooltip>
  <TooltipTrigger>...</TooltipTrigger>
  <TooltipContent>
    Press <Kbd>⌘</Kbd><Kbd>K</Kbd> to open
  </TooltipContent>
</Tooltip>
```

**Common modifier symbols:**
- `⌘` - Command (Mac)
- `⌃` - Control
- `⌥` - Option/Alt
- `⇧` - Shift
- `↵` or `Enter` - Return/Enter
- `⎋` or `Esc` - Escape

### Hover States with Alpha Colors

**Always use alpha-based colors for hover states** instead of solid colors. This ensures hover effects work consistently across light/dark themes and on translucent backgrounds.

```tsx
// Good - alpha-based hover
className="hover:bg-foreground/5"      // Subtle (buttons, triggers)
className="hover:bg-foreground/10"     // Stronger (menu items, list items)

// Bad - solid color hover
className="hover:bg-accent"            // May not work on translucent backgrounds
className="hover:bg-gray-100"          // Doesn't adapt to dark mode
```

**Common alpha values:**
- `/5` (5%) - Subtle hover for buttons, icon buttons, triggers
- `/10` (10%) - Standard hover for menu items, list items
- `/30` (30%) - Placeholder text, disabled elements
- `/50` (50%) - Borders, separators, muted elements
- `/60` (60%) - Placeholder text hover state

### Text Colors with Alpha

**Always use `foreground/x` for text colors** instead of `text-muted-foreground`. This ensures consistent opacity-based styling.

```tsx
// Good - foreground with alpha
className="text-foreground/30"          // Placeholder, disabled
className="text-foreground/50"          // Muted, secondary
className="text-foreground/60"          // Hover state for /30

// Bad - semantic color classes
className="text-muted-foreground"       // Avoid - use foreground/50 instead
className="text-muted-foreground/50"    // Don't combine muted with alpha
```

### Dropdown/Popover Styling

When creating dropdowns or popovers that need consistent styling regardless of theme:

```tsx
// Trigger button - keep active state when menu is open
<DropdownMenuTrigger asChild>
  <button className="hover:bg-foreground/5 data-[state=open]:bg-foreground/5">
    ...
  </button>
</DropdownMenuTrigger>

// Content - use inline styles for values that themes might override
<DropdownMenuContent
  className="font-sans text-xs dark bg-background/80 backdrop-blur-xl backdrop-saturate-150 border-border/50"
  style={{ borderRadius: '8px', boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)' }}
>
```

**Trigger button active state:**
- Use `data-[state=open]:bg-foreground/5` to keep hover appearance when menu is open
- Radix UI automatically sets `data-state="open"` on triggers when their menu is visible

**Why inline styles for borderRadius/boxShadow:**
- Tailwind classes like `rounded-lg` and `shadow-lg` can be overridden by theme CSS variables
- Inline styles ensure exact values (`8px` radius, specific shadow) are applied

**Vibrancy effect:**
- `bg-background/80` - semi-transparent background
- `backdrop-blur-xl` - strong blur of content behind
- `backdrop-saturate-150` - boosts color saturation for macOS-like vibrancy
- `dark` class - force dark mode on dropdown

**Menu item spacing:**
- Use `gap-3` for icon-to-text spacing
- Use `pl-6` on shortcuts for spacing from label (keeps `ml-auto` right alignment)
- Use `pr-4` on items for right padding

**Destructive actions:**
- Always use `variant="destructive"` on `StyledDropdownMenuItem` for destructive actions (delete, remove, etc.)
- The destructive variant automatically applies red color to both the label AND icon
- Never manually add `className="text-red-500"` - use the variant prop instead

```tsx
// Good - uses destructive variant
<StyledDropdownMenuItem variant="destructive" onClick={handleDelete}>
  <Trash2 />
  Delete Source
</StyledDropdownMenuItem>

// Bad - manual color classes
<StyledDropdownMenuItem className="text-red-500" onClick={handleDelete}>
  <Trash2 />
  Delete Source
</StyledDropdownMenuItem>
```

### Context Menu Styling

**Always use `StyledContextMenu*` components** for right-click context menus. They match the `StyledDropdownMenu*` styling exactly.

```tsx
import {
  ContextMenu,
  ContextMenuTrigger,
  StyledContextMenuContent,
  StyledContextMenuItem,
  StyledContextMenuSeparator,
} from '@/components/ui/styled-context-menu'

<ContextMenu>
  <ContextMenuTrigger asChild>
    <button>Right-click me</button>
  </ContextMenuTrigger>
  <StyledContextMenuContent>
    <StyledContextMenuItem onClick={handleAction}>
      <ExternalLink className="h-4 w-4" />
      Open in New Window
    </StyledContextMenuItem>
    <StyledContextMenuSeparator />
    <StyledContextMenuItem onClick={handleDelete} variant="destructive">
      <Trash2 className="h-4 w-4" />
      Delete
    </StyledContextMenuItem>
  </StyledContextMenuContent>
</ContextMenu>
```

**Why styled components?**
- Base `ContextMenuItem` uses `focus:bg-accent` which looks inconsistent
- Styled version uses `hover:bg-foreground/[0.03]` matching `StyledDropdownMenuItem`
- Includes proper icon sizing (`[&>svg]:h-3.5 [&>svg]:w-3.5`)

**Key pattern:** Both `StyledDropdownMenu*` and `StyledContextMenu*` use the same subtle hover (`foreground/[0.03]`). Always use these styled variants for consistency.

### Toast Notifications

**Always use Sonner** for toast notifications (success, error, info, warning). The `<Toaster />` component is already mounted in `main.tsx`.

```tsx
import { toast } from "sonner"

// Basic toasts
toast.success("Settings saved")
toast.error("Failed to connect")
toast.info("New version available")
toast.warning("This action cannot be undone")

// With description
toast.success("File uploaded", {
  description: "document.pdf has been uploaded successfully",
})

// With action button
toast.error("Connection lost", {
  action: {
    label: "Retry",
    onClick: () => reconnect(),
  },
})

// Loading state with promise
toast.promise(saveData(), {
  loading: "Saving...",
  success: "Saved!",
  error: "Failed to save",
})

// Dismiss programmatically
const toastId = toast.loading("Processing...")
// Later...
toast.dismiss(toastId)
```

**When to use toasts:**
- Success confirmations (save, delete, copy)
- Error notifications (API failures, validation errors)
- Async operation feedback (loading → success/error)
- Non-blocking alerts that auto-dismiss

**When NOT to use toasts:**
- Critical errors requiring user action (use dialogs)
- Form validation errors (show inline)
- Blocking confirmations (use dialogs with actions)

## Model Configuration

**Always use the centralized model config** from `src/config/models.ts`. Never hardcode model IDs.

```typescript
// Renderer (via Vite @config alias)
import { MODELS, DEFAULT_MODEL, getModelDisplayName } from '@config/models'

// Main process (via package import)
import { DEFAULT_MODEL } from '@craft-agent/shared/config'
```

Available exports:
- `MODELS` - Array of user-selectable models for UI dropdowns
- `DEFAULT_MODEL` - Default model ID for new sessions
- `getModelDisplayName(id)` - Get display name for a model ID

## Commands

All commands run from the **project root** (not this directory):

```bash
bun run electron:dev          # Hot reload dev mode (recommended for development)
bun run electron:build        # Build all (main, preload, renderer, resources)
bun run electron:start        # Build and run the app

# Individual build steps
bun run electron:build:main      # Bundle main process (esbuild)
bun run electron:build:preload   # Bundle preload script (esbuild)
bun run electron:build:renderer  # Bundle React UI (Vite)
bun run electron:build:resources # Copy icons
```

### Hot Reload Development

`bun run electron:dev` provides hot reload for faster development:

- **Renderer (React)**: Vite HMR - instant updates without restart
- **Main/Preload**: esbuild watch - rebuilds on save (requires Electron restart to take effect)

The renderer loads from `http://localhost:5173` in dev mode instead of file://, enabling Vite's Hot Module Replacement.

## Architecture

```
apps/electron/
├── src/
│   ├── main/              # Electron main process (Node.js)
│   │   ├── index.ts       # Window creation, app lifecycle, nativeTheme listener
│   │   ├── ipc.ts         # IPC handler registration
│   │   ├── menu.ts        # Application menu (File, Edit, View, Help menus)
│   │   ├── sessions.ts    # SessionManager - CraftAgent integration
│   │   ├── deep-link.ts   # Deep link URL parsing and handling
│   │   ├── agent-service.ts # Agent listing, caching, auth checking
│   │   ├── sources-service.ts # Source and authentication service
│   │   ├── onboarding.ts  # Onboarding flow management
│   │   ├── window-manager.ts # Window lifecycle management
│   │   ├── window-state.ts # Window state persistence
│   │   ├── preview-window.ts # Generic preview window base
│   │   ├── code-preview-window.ts # Code preview functionality
│   │   ├── diff-preview-window.ts # Diff preview functionality
│   │   └── terminal-preview-window.ts # Terminal preview
│   ├── preload/           # Context bridge (main ↔ renderer)
│   │   └── index.ts       # Exposes electronAPI to renderer (incl. theme APIs)
│   ├── renderer/          # React UI (browser context)
```

## ⚠️ Common Mistake: Node.js APIs in Renderer

**NEVER import `@craft-agent/shared` packages directly in the renderer!** The renderer runs in a browser context and doesn't have access to Node.js APIs.

❌ **Wrong** (will fail with errors like `randomUUID is not a function`):
```tsx
// In renderer component
const { loadSourcePermissionsConfig } = await import('@craft-agent/shared/agent')
const config = loadSourcePermissionsConfig(workspaceId, sourceSlug)
```

✅ **Correct** (use IPC to call main process):
```tsx
// 1. Add IPC channel to shared/types.ts
export const IPC_CHANNELS = {
  SOURCES_GET_PERMISSIONS: 'sources:getPermissions',
  // ...
}

// 2. Add handler in main/ipc.ts
ipcMain.handle(IPC_CHANNELS.SOURCES_GET_PERMISSIONS, async (_event, workspaceId: string, sourceSlug: string) => {
  const { loadSourcePermissionsConfig } = await import('@craft-agent/shared/agent')
  const workspace = getWorkspaceByNameOrId(workspaceId)
  return loadSourcePermissionsConfig(workspace.rootPath, sourceSlug)
})

// 3. Add to preload/index.ts
contextBridge.exposeInMainWorld('electronAPI', {
  getSourcePermissionsConfig: (workspaceId: string, sourceSlug: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SOURCES_GET_PERMISSIONS, workspaceId, sourceSlug),
  // ...
})

// 4. Use in renderer
const config = await window.electronAPI.getSourcePermissionsConfig(workspaceId, sourceSlug)
```

**Why?** The `@craft-agent/shared` package uses Node.js APIs (`crypto`, `fs`, etc.) that aren't available in the browser/renderer context. All business logic must run in the main process and communicate via IPC.

### Directory Structure (continued)

```
│   │   ├── atoms/         # Jotai atom definitions
│   │   │   └── sessions.ts # Per-session Jotai atoms for performance isolation
│   │   ├── components/
│   │   │   ├── chat/      # Chat UI (Chat, ChatInput, ChatDisplay, SessionList, PermissionBanner)
│   │   │   ├── code-preview/  # Code preview window component
│   │   │   ├── diff-preview/  # Diff preview window component
│   │   │   ├── files/         # File viewer component
│   │   │   ├── icons/     # Custom SVG icons (PanelLeftRounded, SquarePenRounded)
│   │   │   ├── markdown/  # Markdown renderer with syntax highlighting
│   │   │   ├── multi-file-diff/ # Multi-file diff viewer
│   │   │   ├── onboarding/ # Onboarding flow components
│   │   │   ├── preview/   # Preview window components (Monaco, TOC)
│   │   │   ├── terminal-preview/ # Terminal preview window
│   │   │   └── ui/        # shadcn/ui components
│   │   ├── config/        # Renderer configuration (todo-states, etc.)
│   │   ├── contexts/
│   │   │   ├── NavigationContext.tsx  # Type-safe routing and navigation
│   │   │   ├── ChatContext.tsx        # Chat state and session management
│   │   │   └── ThemeContext.tsx       # Theme state management
│   │   ├── lib/
│   │   │   ├── navigate.ts      # Global navigate() function
│   │   │   └── utils.ts         # Utility functions
│   │   ├── event-processor/ # Event streaming and processing
│   │   │   ├── processor.ts   # Event processor logic
│   │   │   ├── helpers.ts     # Processing helpers
│   │   │   └── handlers/      # Event type handlers
│   │   ├── hooks/
│   │   │   ├── useAgentState.ts  # Agent activation state machine (IPC-based)
│   │   │   ├── useBackgroundTasks.ts # Background task tracking
│   │   │   ├── useStatuses.ts    # Workspace status configuration
│   │   │   ├── useTheme.ts       # Cascading theme resolution
│   │   │   ├── useSession.ts     # Session hook for isolated access
│   │   │   ├── useOnboarding.ts  # Onboarding flow management
│   │   │   └── keyboard/         # Keyboard handling hooks
│   │   ├── tabs/          # Tab system management
│   │   ├── utils/         # Additional utilities
│   │   └── playground/    # Component development playground
│   │       ├── PlaygroundApp.tsx     # Main playground component
│   │       ├── ComponentPreview.tsx  # Component preview display
│   │       ├── PropsPanel.tsx        # Dynamic props editor
│   │       └── registry/             # Component registry (chat, icons, markdown)
│   └── shared/
│       ├── types.ts       # IPC channels, Message/Session/FileAttachment types
│       ├── routes.ts      # Type-safe route definitions and builders
│       └── route-parser.ts # Route string parsing utilities
├── dist/                  # Build output
└── resources/             # App icons
```

### IPC Communication

The app uses Electron's IPC for main ↔ renderer communication:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| **Sessions** | | |
| `sessions:*` | renderer → main | Session CRUD (create, delete, rename, archive) |
| `sessions:sendMessage` | renderer → main | Send message with optional file attachments |
| `sessions:setPermissionMode` | renderer → main | Set permission mode ('safe', 'ask', 'allow-all') |
| `sessions:flag/unflag` | renderer → main | Flag/unflag session for attention |
| `sessions:setTodoState` | renderer → main | Set session workflow status |
| `sessions:markRead/markUnread` | renderer → main | Mark session read status |
| `sessions:respondToPermission` | renderer → main | Respond to permission request |
| `sessions:respondToCredential` | renderer → main | Respond to credential request |
| `sessions:updateWorkingDirectory` | renderer → main | Update session working directory |
| `sessions:killShell` | renderer → main | Kill a background shell by ID |
| `tasks:getOutput` | renderer → main | Get output from background task |
| `session:event` | main → renderer | Stream events (text_delta, tool_start, etc.) |
| **Files** | | |
| `file:read` | renderer → main | Read files (path-validated) |
| `file:openDialog` | renderer → main | Open native file picker |
| `file:readAttachment` | renderer → main | Read file as FileAttachment |
| `file:generateThumbnail` | renderer → main | Generate image thumbnail |
| `file:storeAttachment` | renderer → main | Store file attachment |
| **Shell** | | |
| `shell:openUrl` | renderer → main | Open URL in external browser |
| `shell:openFile` | renderer → main | Open file in default application |
| **Sources** | | |
| `sources:get` | renderer → main | Get sources for workspace |
| `sources:create` | renderer → main | Create new source |
| `sources:delete` | renderer → main | Delete source |
| `sources:startOAuth` | renderer → main | Start OAuth flow for source |
| `sources:saveCredentials` | renderer → main | Save source credentials |
| `sources:getPermissions` | renderer → main | Get permissions config |
| `sources:getMcpTools` | renderer → main | Get MCP tools with permissions |
| `sources:changed` | main → renderer | Broadcast source changes |
| **Workspace** | | |
| `workspaces:get` | renderer → main | Get configured workspaces |
| `workspaceSettings:*` | both | Workspace settings CRUD |
| `workspace:readImage` | renderer → main | Read workspace image |
| `workspace:writeImage` | renderer → main | Write workspace image |
| **Theme** | | |
| `theme:*` | both | Theme preference sync |
| `theme:systemChanged` | main → renderer | System theme changed |
| `theme:appChanged` | main → renderer | App theme changed |
| **Preview Windows** | | |
| `codePreview:open/getData` | both | Code preview window |
| `terminalPreview:open/getData` | both | Terminal preview window |
| `multiFileDiff:open/getData` | both | Multi-file diff window |
| **Settings** | | |
| `settings:getDefaultPermissionMode` | renderer → main | Get default permission mode |
| `settings:setDefaultPermissionMode` | renderer → main | Set default permission mode |
| **Statuses** | | |
| `statuses:list` | renderer → main | Get workspace statuses |
| `statuses:changed` | main → renderer | Broadcast status changes |
| **Deep Links** | | |
| `deeplink:navigate` | main → renderer | Deep link tab navigation |

**Event streaming pattern:** `sendMessage` returns immediately. Results stream via `SESSION_EVENT` channel.

### Navigation System

The app uses a **type-safe routing system** for all internal navigation and deep links. All navigation goes through typed route builders instead of hardcoded strings.

**Key Files:**
```
src/shared/routes.ts           # Route definitions and builders
src/shared/route-parser.ts     # Parse route strings into structured objects
src/renderer/lib/navigate.ts   # navigate() function and deep link utilities
src/renderer/contexts/NavigationContext.tsx  # React context for navigation
```

#### Route Types

| Type | Purpose | Example |
|------|---------|---------|
| **view** | Navigate to views | `allChats`, `settings/shortcuts`, `sources/source/github` |
| **action** | Trigger actions | `action/new-chat`, `action/delete-session/abc123` |

#### Using Routes

```typescript
import { navigate, routes } from '@/lib/navigate'

// View routes (compound format)
navigate('settings')                       // Open settings
navigate('settings/shortcuts')             // Open shortcuts settings
navigate('allChats')                       // All chats view
navigate('allChats/chat/session123')       // Specific chat
navigate('flagged/chat/session123')        // Flagged chat
navigate('sources')                        // Sources view
navigate('sources/source/github')          // Source info

// Action routes
navigate(routes.action.newChat())                         // New chat
navigate(routes.action.renameSession('id', 'New Name'))   // Rename session
navigate(routes.action.deleteSession('id'))               // Delete session
navigate(routes.action.flagSession('id'))                 // Flag session
navigate(routes.action.oauth('github'))                   // Start OAuth flow
```

#### React Hook Usage

```typescript
import { useNavigation } from '@/contexts/NavigationContext'

function MyComponent() {
  const { navigate, isReady } = useNavigation()

  return (
    <button onClick={() => navigate('settings')}>
      Settings
    </button>
  )
}
```

#### Global Navigation (Outside React)

The `navigate()` function from `@/lib/navigate` works anywhere - it dispatches a custom event that `NavigationContext` listens for:

```typescript
import { navigate, routes } from '@/lib/navigate'

// Can be called from anywhere, even outside React components
navigate(routes.action.newChat())
```

#### Building Deep Links

```typescript
import { buildDeepLink } from '@/lib/navigate'

// Without workspace (uses current)
buildDeepLink('settings')
// → 'craftagents://settings'

// With workspace
buildDeepLink('allChats/chat/abc', 'workspace123')
// → 'craftagents://workspace/workspace123/allChats/chat/abc'
```

### Deep Links

The app registers the `craftagents://` URL scheme for external deep linking.

**URL Format (Compound Routes):**
```
craftagents://allChats[/chat/{sessionId}]
craftagents://flagged[/chat/{sessionId}]
craftagents://state/{stateId}[/chat/{sessionId}]
craftagents://sources[/source/{sourceSlug}]
craftagents://settings[/{subpage}]
craftagents://action/{actionName}[/{id}][?params]
craftagents://workspace/{workspaceId}/{compoundRoute}
```

**Examples:**
| Use Case | URL |
|----------|-----|
| Settings | `craftagents://settings` |
| Shortcuts | `craftagents://settings/shortcuts` |
| All chats | `craftagents://allChats` |
| Chat session | `craftagents://allChats/chat/session456` |
| Sources | `craftagents://sources` |
| Source info | `craftagents://sources/source/github` |
| New chat | `craftagents://action/new-chat` |
| With workspace | `craftagents://workspace/ws123/allChats/chat/abc` |

**Flow:**
1. User clicks `craftagents://` URL or app launched with URL
2. Main process parses URL via `parseDeepLink()` in `main/deep-link.ts`
3. `handleDeepLink()` focuses/creates workspace window
4. Sends `DEEP_LINK_NAVIGATE` IPC to renderer
5. `NavigationContext` receives event and calls `navigate()` with parsed route
6. Route is dispatched to appropriate handler (view or action)

**Cold Start:** If app isn't running, URL is stored in `pendingDeepLink` and processed after `app.whenReady()`.

### Key Integration Points

**SessionManager** (`main/sessions.ts`):
- Wraps `CraftAgent` from the parent TUI codebase
- Sets up SDK path and authentication on initialization
- Processes `AgentEvent` stream and forwards to renderer
- Tracks `toolUseId → toolName` mapping (since `tool_result` events only have `toolUseId`)
- AI-generated session titles on first exchange (via `generateSessionTitle`)

**Event type mappings:**
| AgentEvent field | Renderer expects |
|------------------|------------------|
| `event.text` | `event.delta` (text_delta) |
| `event.message` | `event.error` (error) |

## Critical SDK Setup

The Claude Agent SDK requires explicit setup in Electron (unlike TUI where it's implicit):

### 1. SDK Path (in `sessions.ts`)
```typescript
// Must set before creating any CraftAgent instances
const cliPath = join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'cli.js')
setPathToClaudeCodeExecutable(cliPath)
```
Without this, you'll get: `Error: The "path" argument must be of type string...`

### 2. Authentication Environment
Authentication env vars must be set BEFORE creating agents:
```typescript
// Craft Credits
setAnthropicOptionsEnv({ USE_CRAFT_AI_GATEWAY: 'true', CRAFT_API_GATEWAY_TOKEN: token })
process.env.ANTHROPIC_API_KEY = 'craft-credits-placeholder'

// Claude Max OAuth
process.env.CLAUDE_CODE_OAUTH_TOKEN = token

// API Key
process.env.ANTHROPIC_API_KEY = apiKey
```

## Build Configuration

**esbuild** (main/preload): Only `electron` is externalized. SDK is bundled into main.js.

**Vite** (renderer): Standard React build with Tailwind CSS v4.

### Google OAuth Environment Variables

To enable Google API connections (Gmail, Calendar, Drive), set these environment variables before building:

```bash
export GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
export GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
bun run electron:build
```

Get credentials from [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create OAuth Client ID (Desktop app).

**Scopes are automatically selected** based on the Google service being connected (Gmail, Calendar, or Drive).

These are baked into `dist/main.cjs` at build time via esbuild `--define` flags in `package.json`.

## Theming

The app supports a **two-layer theming system** using CSS custom properties:

### Layers

| Layer | HTML Attribute | CSS Selector | Purpose |
|-------|----------------|--------------|---------|
| **Mode** | `class="dark"` | `.dark { }` | Light/Dark mode |
| **Color Theme** | `data-theme="ocean"` | `[data-theme="ocean"]` | Custom color palettes |

Combined: `<html class="dark" data-theme="ocean">`

### Files

- **`index.css`** - CSS variables for `:root` (light) and `.dark` (dark) modes
- **`context/ThemeContext.tsx`** - React context managing theme state
- **`main/index.ts`** - Electron `nativeTheme` listener for system sync
- **`preload/index.ts`** - Exposes theme APIs to renderer

### ThemeContext API

```typescript
const { mode, resolvedMode, colorTheme, setMode, setColorTheme } = useTheme()

// mode: 'light' | 'dark' | 'system' (user preference)
// resolvedMode: 'light' | 'dark' (actual applied mode)
// colorTheme: string (e.g., 'default', 'ocean')
```

### Adding Custom Color Themes

Add to `index.css`:

```css
/* Custom theme - Light mode */
[data-theme="ocean"] {
  --primary: hsl(200 80% 50%);
  --ring: hsl(200 80% 50%);
}

/* Custom theme - Dark mode */
.dark[data-theme="ocean"] {
  --primary: hsl(200 80% 65%);
  --ring: hsl(200 80% 65%);
}
```

### Electron Integration

- **`nativeTheme.shouldUseDarkColors`** - Get current system preference
- **`nativeTheme.on('updated')`** - Listen for macOS appearance changes
- Renderer receives updates via `theme:systemChanged` IPC channel

## Animations

**Use Motion (formerly Framer Motion)** for all animations. The library provides smooth 60-120fps animations with spring physics.

```bash
# Already installed in apps/electron/package.json
import { motion } from "motion/react"
```

### Spring Physics Presets

```typescript
// Snappy with minimal bounce (default for UI)
const snappySpring = {
  type: "spring",
  stiffness: 400,
  damping: 30,
  mass: 0.8,
}

// More pronounced bounce (playful)
const bouncySpring = {
  type: "spring",
  stiffness: 300,
  damping: 20,
  mass: 1,
}

// Exponential feel (no bounce, smooth settle)
const exponentialSpring = {
  type: "spring",
  stiffness: 600,
  damping: 40,  // Critical damping = no oscillation
}
```

### Performance Best Practices

1. **Animate GPU-accelerated properties only**: `transform`, `opacity`
2. **Avoid animating**: `width`, `height`, `top`, `left` (trigger layout recalculation)
3. **Use `overflow-hidden`** on parent to clip content during width/transform animations
4. **Use `initial={false}`** to skip animation on mount

### Example: Animated Sidebar

```tsx
<motion.div
  initial={false}
  animate={{ width: isVisible ? 260 : 0 }}
  transition={{
    type: "spring",
    stiffness: 400,
    damping: 30,
    mass: 0.8,
  }}
  className="h-full overflow-hidden shrink-0"
>
  <div className="w-[260px] h-full">
    {/* Fixed-width content */}
  </div>
</motion.div>
```

**Note:** The sidebar uses `width` animation (not `transform`) for proper layout flow, but the content inside is fixed-width so it doesn't reflow during animation.

## Logging & Debugging

**Important:** Prefer logging over `console.log` for debugging. Craft Agent (the AI assistant) can read log files directly via Grep/Read tools, making logs the preferred way to surface debug information during development.

### Overview

The Electron app has two logging systems:
1. **`electron-log`** - Main process scoped loggers (JSON file + console)
2. **`debug()` utility** - Shared code (auto-routes to console + file in Electron)

**Debug mode:** Automatically enabled when running from source (`!app.isPackaged`)

### Running with Logs

```bash
# Start Electron in development (debug mode automatic)
bun run electron:start

# Logs appear in:
# 1. Terminal console - immediate visibility
# 2. File: ~/Library/Logs/Craft Agents/main.log - JSON Lines format
# 3. File: /tmp/craft-debug.log - shared code debug logs
```

### Main Process Loggers (electron-log)

Import from `src/main/logger.ts`:

```typescript
import { mainLog, sessionLog, ipcLog, windowLog, agentLog, isDebugMode } from './logger'

mainLog.info('App started')
sessionLog.info('Session created', { sessionId: 'abc123' })
ipcLog.debug('Message received', { channel: 'chat' })
windowLog.warn('Window not found', { windowId: 123 })
agentLog.error('Agent failed', { error: err.message })
```

### Shared Code Logger (debug utility)

For code in `@craft-agent/shared` that runs in Electron:

```typescript
import { debug, createLogger } from '@craft-agent/shared/utils'

// Simple debug
debug('Processing request', { id: 123 })

// Scoped logger
const log = createLogger('mcp')
log.info('Connected to server')
log.error('Connection failed', error)
```

The utility auto-detects Electron and outputs to both console and `/tmp/craft-debug.log`.

### Log Scopes Reference

| Scope | Logger | Use For |
|-------|--------|---------|
| `main` | `mainLog` | App lifecycle, global events, menu actions |
| `session` | `sessionLog` | Session CRUD, state changes, persistence |
| `ipc` | `ipcLog` | Renderer ↔ Main communication |
| `window` | `windowLog` | Window creation, focus, state, positioning |
| `agent` | `agentLog` | Claude SDK, tool calls, streaming, events |

### Log Formats

**Console output (readable):**
```
2026-01-05T06:30:00.000Z INFO  [session] Session created {"sessionId":"abc123"}
```

**File output (JSON Lines):**
```json
{"timestamp":"2026-01-05T06:30:00.000Z","level":"info","scope":"session","message":["Session created",{"sessionId":"abc123"}]}
```

### Querying Log Files

```bash
# Watch electron-log output
tail -f ~/Library/Logs/Craft\ Agents/main.log

# Watch shared debug output
tail -f /tmp/craft-debug.log

# Search by scope (electron-log)
grep '"scope":"session"' ~/Library/Logs/Craft\ Agents/main.log

# Parse with jq
cat ~/Library/Logs/Craft\ Agents/main.log | jq 'select(.level == "error")'
```

### Configuration

- **electron-log:** `src/main/logger.ts` - 5MB rotation, disabled in production
- **debug utility:** `@craft-agent/shared/utils` - auto-routes by environment

### Best Practices

1. **Prefer logging over console.log** - Craft Agent can read log files for debugging
2. **Use scoped loggers** - `sessionLog`, `ipcLog`, etc. for organized output
3. **Include context objects** - Pass structured data as second argument
4. **Use appropriate log levels** - `debug` for verbose, `info` for important events, `error` for failures

### DevTools

Opens automatically in development for renderer debugging (React DevTools, network inspection).

## Markdown Rendering

Messages are rendered with full markdown support using custom components in `components/markdown/`:

**Components:**
- `Markdown.tsx` - Main renderer using `marked` with custom tokenizers
- `CodeBlock.tsx` - Syntax-highlighted code blocks with Shiki
- `linkify.ts` - Auto-links URLs and file paths

**Features:**
- GitHub-flavored markdown (tables, task lists, strikethrough)
- Syntax highlighting for 100+ languages via Shiki
- Clickable file paths (opens in default app via `shell.openPath`)
- Clickable URLs (opens in browser via `shell.openExternal`)
- Copy button on code blocks

**Usage:**
```tsx
import { Markdown } from '@/components/markdown'

<Markdown content={message.content} onOpenFile={handleOpenFile} onOpenUrl={handleOpenUrl} />
```

## Session State Architecture

The app uses a **hybrid React/Jotai state management** approach for session data:

**Why hybrid?**
- React state (`sessions` array in `App.tsx`) is the source of truth
- Jotai atoms provide per-session isolation for performance
- Without isolation, streaming in Session A would cause re-renders in Session B

**Key files:**
- `App.tsx` - React state + auto-sync effect
- `atoms/sessions.ts` - Per-session Jotai atoms
- `context/ChatContext.tsx` - `useSession(id)` hook for isolated access

**How it works:**
```
setSessions() called (React state update)
       ↓
useEffect triggers syncSessionsToAtoms()
       ↓
Per-session atoms updated (only changed sessions)
       ↓
Components using useSession(id) re-render
```

**Component subscription patterns:**
```typescript
// For session lists - reads from context (React state)
const { sessions } = useChatContext()

// For chat panels - reads from atom (isolated updates)
const session = useSession(sessionId)
```

**Adding new session updates:**
Just use `setSessions()` - the sync effect handles atom updates automatically. No need to manually update atoms.

## Session Management

Sessions support naming, archiving, and persistence:

**Session Naming:**
- AI-generated titles after first assistant response (uses `generateSessionTitle`)
- Manual renaming via `renameSession(sessionId, name)`
- Displayed in session list instead of truncated message preview

**Persistence:**
- Sessions stored in `~/.craft-agent/workspaces/{id}/sessions/`
- Messages, SDK session ID, agent ID, name, and archive state are persisted
- Sessions automatically restore on app restart

**Archive:**
- Sessions can be archived/unarchived (moved between Inbox and Archive views)
- Archived sessions are hidden from main inbox but preserved

## Permission Modes

Sessions use a three-level permission mode system to control tool execution:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `'safe'` | Blocks all write operations, never prompts | Read-only exploration, planning |
| `'ask'` | Prompts user for bash commands (default) | Normal interactive use |
| `'allow-all'` | Auto-approves all commands | Trusted automation |

**Session-level:**
```typescript
// Set permission mode for a session
await window.electronAPI.setPermissionMode(sessionId, 'safe')
```

**Default for new sessions:**
```typescript
const mode = await window.electronAPI.getDefaultPermissionMode()
await window.electronAPI.setDefaultPermissionMode('ask')
```

**Session state:**
```typescript
interface Session {
  permissionMode?: PermissionMode  // Default: 'ask'
  // ...
}
```

**Events:**
- `permission_mode_changed` event sent when mode changes: `{ sessionId, permissionMode }`

**UI:** The `ChatDisplay` component shows a permission mode badge with dropdown for cycling modes.

## Shell Operations

The app can open URLs and files in external applications:

```typescript
// Open URL in default browser
await window.electronAPI.openUrl('https://example.com')

// Open file in default application (e.g., VS Code for .ts files)
await window.electronAPI.openFile('/path/to/file.ts')
```

**Security:** URLs are validated to only allow `http:`, `https:`, and `mailto:` protocols. File paths are validated against allowed directories.

## File Attachments

The app supports attaching files to messages (images, PDFs, code files):

**Components:**
- `AttachmentPreview.tsx` - Shows attached files as bubbles above the textarea (ChatGPT-style)
- `ChatInput.tsx` - Handles file picker, drag-drop, paste

**Flow:**
1. User clicks paperclip or drags files → `openFileDialog()` returns paths
2. Paths are read via `readFileAttachment()` → returns `FileAttachment` objects
3. Attachments passed to `sendMessage(sessionId, message, attachments)`
4. Main process forwards attachments to `CraftAgent.chat()`

**Supported types:**
- Images: PNG, JPG, JPEG, GIF, WebP (displayed as thumbnails)
- Documents: PDF, TXT, MD
- Code: JS, TS, TSX, JSX, PY, JSON, CSS, HTML, XML, YAML

## Application Menu

The app menu (`main/menu.ts`) provides standard macOS/Windows menu items:

**Menu Structure:**
- **File**: New Chat (⌘N)
- **Edit**: Cut, Copy, Paste, Select All
- **View**: Reload, Toggle DevTools, Zoom controls
- **Help**: Open Help, Keyboard Shortcuts

**IPC Channels:**
```typescript
MENU_NEW_CHAT           // Create new session
MENU_OPEN_SETTINGS      // Open settings dialog
MENU_KEYBOARD_SHORTCUTS // Show keyboard shortcuts
MENU_OPEN_HELP          // Open help URL
```

## Component Playground

A development tool for testing UI components in isolation:

**Access:** Run `bun run electron:dev` and navigate to `/playground.html`

**Features:**
- Browse all registered components in sidebar
- Live prop editing with type-aware inputs
- Theme toggle (light/dark)
- Component preview with state management

**Adding Components:**
```typescript
// In playground/registry/index.ts
import { myComponentDefinitions } from './my-components'

export const componentRegistry = [
  ...chatComponents,
  ...myComponentDefinitions,
]
```

## Permission Banner

The `PermissionBanner` component shows bash command approval requests:

```tsx
<PermissionBanner
  command="rm -rf /tmp/cache"
  onAllow={() => respond('allow')}
  onAlwaysAllow={() => respond('always_allow')}
  onDeny={() => respond('deny')}
/>
```

**Styling:** Amber border/background with shield icon, three action buttons.

## Background Tasks

The app supports running long-running tasks (tests, builds, agents) in the background:

**Components:**
- `ActiveOptionBadges.tsx` - Displays active options including background tasks bar
- `ActiveTasksBar.tsx` - Shows running tasks with elapsed time and actions
- `TaskActionMenu.tsx` - Dropdown menu for task actions (view output, stop, copy ID)

**Hook:** `useBackgroundTasks.ts`
- Per-session task tracking via Jotai atoms
- Methods: `addTask`, `updateTaskProgress`, `removeTask`, `killTask`
- Task structure: `{ id, type, toolUseId, startTime, elapsedSeconds, intent }`

**Session events:**
- `task_backgrounded` - Agent task started in background
- `shell_backgrounded` - Bash shell backgrounded
- `task_progress` - Elapsed time updates

**Limitations:**
- Task output retrieval not yet implemented (check main chat panel)
- Agent task killing not available (no SDK API)

## Multi-File Diff Window

VS Code-style pop-out window for viewing all file changes in a turn:

**Components:**
- `MultiFileDiffWindowManager` (`main/multi-file-diff-window.ts`) - Window lifecycle
- `MultiFileDiffApp.tsx` - React app with sidebar + Monaco DiffEditor

**Features:**
- Sidebar file tree with change counts
- Consolidated view (by file) or ungrouped (by operation)
- Monaco DiffEditor with syntax highlighting
- Full file context reconstruction

**Types:**
```typescript
interface FileChange {
  id: string
  filePath: string
  toolType: 'Edit' | 'Write'
  original: string
  modified: string
}
```

**Integration:** TurnCard shows "View all file changes" button when turn has Edit/Write activities.

## Dynamic Statuses

Workspace-level customizable session status configuration:

**Hook:** `useStatuses.ts`
- Loads status config from workspace
- Auto-refreshes on workspace change
- Subscribes to live status changes

**Config location:** `~/.craft-agent/workspaces/{id}/statuses/config.json`

**Integration:** `config/todo-states.tsx` loads dynamic statuses instead of hardcoded values.

## Building for macOS Distribution

Build a distributable DMG for macOS using the `build-dmg.sh` script:

```bash
# From apps/electron directory
bun run dist:mac          # Build arm64 (Apple Silicon) DMG
bun run dist:mac:x64      # Build x64 (Intel) DMG

# Or run the script directly
bash scripts/build-dmg.sh arm64
bash scripts/build-dmg.sh x64
```

**What the script does:**
1. Downloads pinned Bun runtime (v1.3.5) with SHA256 checksum verification
2. Copies SDK from root `node_modules` (monorepo hoisting workaround)
3. Copies `cache-ttl-interceptor.ts` for Craft gateway redirect
4. Builds the Electron app (`bun run electron:build`)
5. Packages with `electron-packager` (no ASAR for subprocess compatibility)
6. Creates compressed DMG via `hdiutil`

**Output:** `apps/electron/release/Craft-Agent-{arch}.dmg` (~318MB)

**Requirements:**
- macOS (uses `hdiutil` for DMG creation)
- Bun installed (for build step)
- Run `bun install` from repo root first

**Build artifacts (gitignored):**
- `vendor/` - Bundled Bun runtime
- `packages/` - Copied interceptor
- `release/` - Packaged app and DMG
- `node_modules/@anthropic-ai/` - Copied SDK

**Architecture:**
```
Development:
  system bun → cli.js (root node_modules) → interceptor (packages/shared)

Packaged DMG:
  vendor/bun/bun → cli.js (bundled) → interceptor (bundled)
                      ↑                     ↑
               app.getAppPath()/...   app.getAppPath()/...
```

The packaged app uses `app.isPackaged` to detect runtime environment and resolves paths via `app.getAppPath()` instead of `process.cwd()`.

## Current Limitations

1. No Windows/Linux distribution builds yet (macOS only)
