# CLAUDE.md

Craft Agent is a Claude Code-like interface for managing Craft documents using the Claude Agent SDK and Craft MCP servers. Supports multiple workspaces with OAuth authentication.

**Keep docs up-to-date:** `packages/shared/` → this file | `apps/electron/` → `apps/electron/CLAUDE.md` | `apps/tui/` → `apps/tui/CLAUDE.md`

## Monorepo Structure

```
craft-tui-agent/
├── apps/
│   ├── electron/    # Desktop GUI (multi-session inbox)
│   └── tui/         # Terminal CLI (Claude Code-like)
└── packages/
    ├── core/        # @craft-agent/core - Shared types
    └── shared/      # @craft-agent/shared - Business logic
```

**Imports:** `import { CraftAgent } from '@craft-agent/shared/agent'`

**Sub-docs:** [`apps/electron/CLAUDE.md`](apps/electron/CLAUDE.md) | [`apps/tui/CLAUDE.md`](apps/tui/CLAUDE.md) | [`packages/shared/CLAUDE.md`](packages/shared/CLAUDE.md)

## Commands

```bash
bun install                  # Install deps
bun start                    # Run TUI
bun dev                      # TUI with auto-reload
bun run electron:start       # Build & run Electron
bun run typecheck:all        # Type check all packages
bun link                     # Create global 'craft' command
```

**CLI Flags:**
- `--workspace/-w <name>` - Select workspace by name, ID, or URL
- `--agent/-a <name>` - Activate agent (with or without @ prefix)
- `--model/-m <model>` - Claude model to use
- `--debug` - Log to `/tmp/craft-debug.log`
- `--new` - Start fresh session
- `--session <id>` - Resume specific session
- `--print/-p <query>` - Headless mode (non-interactive)
- `--output-format <fmt>` - text, json, stream-json
- `--permission-policy <policy>` - deny-all, allow-safe, allow-all

## Releasing

Via [GitHub Actions](https://github.com/lukilabs/craft-terminal-agent/actions/workflows/build-and-upload.yml):
1. Go to Actions → "Build and Upload" → Run workflow
2. Enter version, check "upload to /latest" for default
3. Builds: darwin-arm64, darwin-x64, linux-x64, linux-arm64

**Install:** `curl -fsSL https://agents.craft.do/install.sh | bash`

## Architecture

### Agent Layer (`packages/shared/src/agent/craft-agent.ts`)

Core `CraftAgent` wrapping `@anthropic-ai/claude-agent-sdk`:
- SDK's agentic loop handles tool calls, MCP communication
- `PreToolUse` hook for bash permission approval
- `PostToolUse` hook summarizes large results (>15k tokens) using `_intent` for context
- `formatSourceState()` injects `<sources>` context into user messages
- Session continuity via `resume` option

**AgentEvent types:** `status`, `text_delta`, `text_complete`, `tool_start`, `tool_result`, `permission_request`, `ask_user`, `error`, `complete`

### Configuration (`packages/shared/src/config/storage.ts`)

```typescript
interface StoredConfig {
  authType?: 'api_key' | 'oauth_token' | 'craft_credits';
  model?: string;
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
}

interface Workspace {
  id: string;
  name: string;
  mcpUrl: string;
  mcpAuthType?: 'workspace_oauth' | 'workspace_bearer' | 'public';
  sessionId?: string;
}
```

**Paths:**
- Config: `~/.craft-agent/config.json`
- Credentials: `~/.craft-agent/credentials.enc` (AES-256-GCM)
- Workspaces: `~/.craft-agent/workspaces/{id}/`
- Preferences: `~/.craft-agent/preferences.json`

**⚠️ Auth Separation:**
- `craft_oauth::global` - Craft API only (managing spaces, MCP links). NEVER for MCP auth.
- `workspace_oauth::{workspaceId}` - MCP server auth. Each server has its own OAuth.
- `getWorkspaceAccessTokenAsync()` does NOT fall back to Craft OAuth.

### Setup Flow

1. Welcome → 2. Craft OAuth → 3. Select space (auto-creates MCP link) → 4. Billing method → 5. Credentials (if needed) → 6. Validate MCP → 7. Complete

### Credential Storage (`packages/shared/src/credentials/`)

AES-256-GCM encrypted file at `~/.craft-agent/credentials.enc`. Cross-platform, no OS prompts.

**Key format:** `{type}::{scope}`
```
anthropic_api_key::global             # Anthropic API key
claude_oauth::global                  # Claude Max OAuth
craft_oauth::global                   # Craft API OAuth
workspace_oauth::{workspaceId}        # Workspace MCP OAuth
workspace_bearer::{workspaceId}       # Workspace bearer token

# Source credentials
source_oauth::{sourceSlug}            # OAuth for MCP/API sources
source_bearer::{sourceSlug}           # Bearer tokens
source_apikey::{sourceSlug}           # API keys
source_basic::{sourceSlug}            # Basic auth

# Agent-scoped source credentials
agent_source_oauth::{agentSlug}::{sourceSlug}
agent_source_bearer::{agentSlug}::{sourceSlug}
agent_source_apikey::{agentSlug}::{sourceSlug}
agent_source_basic::{agentSlug}::{sourceSlug}

# Agent-managed secrets
agent_secret::{name}
```

**Backend priority:** 1. Env vars (`ANTHROPIC_API_KEY`, `CRAFT_CLAUDE_OAUTH_TOKEN`) 2. Encrypted file

### Agent System (`packages/shared/src/agents/`)

Folder-based agents at `~/.craft-agent/workspaces/{ws}/agents/{agent}/`:
```
├── config.json      # { name, slug, enabled, useSources }
├── instructions.md  # Agent instructions (markdown)
└── sources/         # Optional agent-scoped sources
```

**Sources** at `~/.craft-agent/workspaces/{ws}/sources/{source}/`:
```
├── config.json      # { type, url, auth, iconUrl, tagline }
└── guide.md         # Usage documentation
```

**Source types:** `mcp` (HTTP/SSE), `api` (REST with flexible tool), `local`

**API Tools (`api-tools.ts`):** `createApiServer()` creates single `api_{name}` tool accepting `{ path, method, params }`. Auth types: `none`, `header`, `bearer`, `query`, `basic`.

### MCP Tool Metadata

Fetch interceptor injects `_displayName` and `_intent` into MCP tool schemas:
- Model must include both (required in schema)
- `PreToolUse` strips them before forwarding to MCP
- Used for UI display and summarization context

### Safe Mode

Read-only mode (SHIFT+TAB or `/safe`):
- **Blocked:** `api_*`, Bash, Write, Edit, MCP write tools
- **Allowed:** Read, Glob, Grep, Task, WebFetch, WebSearch, MCP read tools, TodoWrite

### Headless Mode (`packages/shared/src/headless/`)

```bash
craft --print "query" --output-format json --permission-policy allow-safe
```

When `isHeadless: true`: prompts wrapped in `<headless_mode>` tags, safe mode disabled. Questions return empty.

### Extended Cache TTL (`packages/shared/src/cache-ttl-interceptor.ts`)

Extends Anthropic cache from 5min to 1hr via fetch interceptor (loaded via `bunfig.toml` preload).
- **Default:** Auto - 1h for Opus, 5m for others
- **Config:** `extendedCacheTtl: true/false` to force

## Key Patterns

**Streaming:** `CraftAgent.chat()` → `AsyncGenerator<SDKMessage>` → `AgentEvent` → 50ms throttled updates

**Tool Permissions:** `PreToolUse` blocks dangerous bash by default. User approves in TUI. Dangerous commands (rm, sudo, git push) never auto-allow.

**Session Continuity:** SDK session IDs per workspace. `resume` continues conversations. Failures clear and start fresh.

**Large Response Summarization:** >15k tokens auto-summarized via Haiku using `_intent` for context. Falls back to truncation.

## Project Structure

### `packages/shared/src/`

| Directory | Purpose |
|-----------|---------|
| `agent/` | CraftAgent, session-scoped-tools, mode-manager |
| `agents/` | folder-manager, folder-storage, api-tools, builtin-agents |
| `sources/` | types, storage, service |
| `auth/` | oauth, craft-token, claude-token, gmail-oauth |
| `config/` | storage, preferences, models |
| `credentials/` | manager, backends (secure-storage, env) |
| `mcp/` | client, validation |
| `prompts/` | system prompt |
| `headless/` | runner, types, output |
| `utils/` | debug, files, summarize, icon, title-generator |

## Debugging

```bash
# Terminal 1: Run with debug logging
bun start --debug

# Terminal 2: Watch logs
tail -f /tmp/craft-debug.log
```

Use `debug()` from `@craft-agent/shared/utils`. Never truncate log output.

## Development Secrets (1Password)

```bash
brew install 1password-cli
# Enable CLI in 1Password: Settings → Developer → CLI → "Integrate"
bun run sync-secrets   # Syncs op:// refs from .env.1password → .env
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Bun |
| AI | @anthropic-ai/claude-agent-sdk |
| Credentials | AES-256-GCM encrypted file |
| TUI | Ink 5.x, marked + shiki, meow |
| Electron | Electron + React, shadcn/ui + Tailwind v4, esbuild + Vite |

## Dependency Notes

**markitdown-js** (`^0.0.14`) - Used for file attachment processing in Electron (`apps/electron/src/main/ipc.ts`). Pre-release package with native binary dependencies:
- `exiftool-vendored` (native binary execution)
- `fluent-ffmpeg` (requires FFmpeg binary)
- `node-tesseract-ocr` (requires Tesseract binary)

Consider whether full file conversion is needed or if simpler parsing suffices for your use case.

**Duplicate markdown systems** - The codebase uses three markdown libraries:
- `marked` (TUI rendering)
- `react-markdown` (Electron message display)
- `remark` + `strip-markdown` (Electron text processing)

Future consolidation opportunity: unify on a single markdown approach.
