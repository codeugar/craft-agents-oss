# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Craft TUI Agent is a Claude Code-like terminal interface for managing Craft documents. It uses the Anthropic SDK directly (not Claude Agent SDK) to interact with Claude models and connects to a Craft MCP server for document operations.

## Commands

```bash
# Install dependencies
bun install

# Run the application
bun start                # or: bun run src/index.tsx

# Development with auto-reload
bun dev

# Type checking
bun run typecheck

# Install globally (creates 'craft' command)
bun link
```

## Architecture

### Entry Point & Setup Flow
- `src/index.tsx` - CLI entry point using meow for argument parsing. Renders either the Setup wizard or main App based on stored config.
- Configuration stored in `~/.craft-agent/config.json` via `src/config/storage.ts`
- User preferences (name, timezone, etc.) stored separately via `src/config/preferences.ts`

### Agent Layer
- `src/agent/craft-agent.ts` - Core agent class (`CraftAgent`) that:
  - Uses `@anthropic-ai/sdk` directly for Claude API calls (not Claude Agent SDK despite the npm dependency)
  - Implements streaming with agentic tool loop (continues until no more tool calls)
  - Manages conversation history internally
  - Handles OAuth token refresh for Craft MCP authentication
  - Emits typed `AgentEvent` stream events (text_delta, tool_start, tool_result, etc.)
  - Integrates Claude's built-in tools: web_search, web_fetch, code_execution
  - Has a built-in `update_user_preferences` tool for storing user context

### MCP Integration
- `src/mcp/client.ts` - Wraps `@modelcontextprotocol/sdk` with StreamableHTTPClientTransport
- `src/mcp/tools.ts` - Tool registry and help formatting for Craft MCP tools
- Tools are fetched from the MCP server at runtime and converted to Anthropic tool format

### TUI Layer (Ink/React)
- `src/tui/App.tsx` - Main application component, handles slash commands (/help, /tools, /model, /web, /clear, etc.)
- `src/tui/components/` - UI components (Header, Messages, Input, ToolCall, Setup wizard, Spinner)
- `src/tui/hooks/useAgent.ts` - React hook that wraps CraftAgent, manages messages state, handles streaming updates with throttling
- `src/tui/hooks/useHistory.ts` - Command history for up/down arrow navigation
- `src/tui/utils/files.ts` - File attachment processing (images, PDFs, text files)
- `src/tui/utils/markdown.ts` - Markdown rendering for terminal using marked + marked-terminal

### System Prompt
- `src/prompts/system.ts` - Defines the Craft Assistant persona and capabilities, includes current date/time context and user preferences

## Key Patterns

### Streaming Architecture
The agent uses a custom event-based streaming pattern:
1. `CraftAgent.chat()` is an async generator yielding `AgentEvent` objects
2. `useAgent` hook consumes events and updates React state with throttling (50ms) to reduce flickering
3. Tool execution happens inline during streaming - the agent loops until no more tool calls

### OAuth Flow
- OAuth handled in `src/auth/oauth.ts` with automatic token refresh
- Supports both authenticated and public MCP servers (controlled by `isPublic` flag in config)

### Message Types
Messages have types: 'user', 'assistant', 'tool', 'error', 'status', 'system' - rendered differently in the TUI

## Tech Stack
- **Runtime**: Bun
- **TUI**: Ink (React for CLIs)
- **AI**: @anthropic-ai/sdk (direct API, not Agent SDK)
- **MCP**: @modelcontextprotocol/sdk with StreamableHTTPClientTransport
