# Craft TUI Agent

A Claude Code-like TUI (Terminal User Interface) agent for Craft documents using the Claude Agent SDK and Craft MCP.

## Features

- **Claude Code-like Experience**: Streaming responses, tool visualization, and real-time updates
- **Craft MCP Integration**: Access to 32 Craft document tools (blocks, collections, search, tasks)
- **Rich Terminal UI**: Built with Ink (React for CLIs)
- **Command History**: Navigate previous inputs with arrow keys
- **Slash Commands**: `/help`, `/tools`, `/setup`, `/clear`, `/exit`
- **Interactive Setup**: First-run wizard to configure API keys and MCP connection

## Prerequisites

- [Bun](https://bun.sh/) v1.0+
- [Anthropic API Key](https://console.anthropic.com/)
- Craft MCP server running (with valid workflow link)

## Installation

```bash
# Clone the repository
git clone https://github.com/your-org/craft-tui-agent.git
cd craft-tui-agent

# Install dependencies
bun install

# Install globally (creates 'craft' command)
bun link
```

After linking, you can run `craft` from anywhere in your terminal.

## First Run Setup

On first run, you'll be guided through an interactive setup wizard:

```
┌─────────────────────────────────────┐
│ Craft TUI Agent - Setup             │
└─────────────────────────────────────┘
Step 1 of 4: Welcome

Welcome to Craft TUI Agent!
You'll need:
• An Anthropic API key (from console.anthropic.com)
• Your Craft MCP server URL (workflow link)
• A bearer token for authentication

Press Enter to continue...
```

The wizard will ask for:
1. **Anthropic API Key** - Get one from [console.anthropic.com](https://console.anthropic.com)
2. **Craft MCP URL** - Your workflow link URL (e.g., `http://localhost:3000/v1/links/abc123/mcp`)
3. **Bearer Token** - Authentication token for your MCP server

Configuration is saved to `~/.craft-agent/config.json`

## Usage

```bash
# Run the TUI agent (shows setup wizard on first run)
craft

# Re-run setup wizard to change configuration
craft --setup

# Override config with CLI options
craft --url http://localhost:3000/v1/links/abc123/mcp

# Show help
craft --help

# Development mode (auto-reload)
bun dev
```

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show help message |
| `/tools` | List available Craft MCP tools |
| `/setup` | Re-run the configuration wizard |
| `/config` | Show current configuration |
| `/clear` | Clear conversation |
| `/exit` | Exit application |
| `Ctrl+C` | Interrupt / Exit |
| `Up/Down` | Navigate command history |

## Available Craft Tools

### Read-Only
- `blocks_get` - Fetch document content
- `document_search` - Search within document
- `dailyNotes_search` - Search across daily notes
- `documents_search` - Multi-document search
- `collections_list` - List all collections
- `collectionSchema_get` - Get collection schema
- `collectionItems_get` - Get collection items
- `tasks_get` - Query tasks
- `documents_list` - List documents

### Write
- `blocks_add`, `blocks_update`, `blocks_move`
- `markdown_add`
- `collections_create`, `collectionSchema_update`
- `collectionItems_add`, `collectionItems_update`
- `tasks_add`, `tasks_update`

### Destructive
- `blocks_delete`
- `collectionItems_delete`
- `tasks_delete`

## Example Prompts

```
Show me today's daily note
Search for meeting notes about project X
Add a task: Review PR #123
List all my collections
What tasks do I have due this week?
```

## Architecture

```
src/
├── index.tsx           # Entry point with CLI + setup flow
├── agent/
│   ├── craft-agent.ts  # Claude Agent SDK wrapper
│   └── stream-handler.ts
├── mcp/
│   └── tools.ts        # Tool registry
├── tui/
│   ├── App.tsx         # Main application
│   ├── components/
│   │   ├── Setup.tsx   # Setup wizard
│   │   ├── Header.tsx  # Status bar
│   │   ├── Messages.tsx
│   │   ├── Input.tsx
│   │   ├── ToolCall.tsx
│   │   └── Spinner.tsx
│   └── hooks/
│       ├── useAgent.ts
│       └── useHistory.ts
├── prompts/
│   └── system.ts       # System prompt
└── config/
    ├── env.ts          # Environment validation
    └── storage.ts      # Persistent config (~/.craft-agent/)
```

## Development

```bash
# Type checking
bun run typecheck

# Run in watch mode
bun dev
```

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **SDK**: [@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- **TUI**: [Ink](https://github.com/vadimdemedes/ink) (React for CLIs)
- **MCP**: Server-Sent Events transport

## License

MIT
