# Craft Agent CLI Guide

`craft-agent` is the preferred interface for managing workspace config domains such as labels, sources, skills, and automations.

## Usage

```bash
craft-agent <entity> <action> [args] [--flags] [--json '<json>'] [--stdin]
```

### Global flags
- `craft-agent --help`
- `craft-agent --version`
- `craft-agent --discover`

### Input modes
- Flat flags for simple values
- `--json` for structured inputs
- `--stdin` for piped JSON object input

---

<!-- cli:label:start -->
## Label

Manage workspace labels stored under `labels/`.

### Commands
- `craft-agent label list`
- `craft-agent label get <id>`
- `craft-agent label create --name "<name>" [--color "<color>"] [--parent-id <id|root>] [--value-type string|number|date]`
- `craft-agent label update <id> [--name "<name>"] [--color "<color>"] [--value-type string|number|date]`
- `craft-agent label delete <id>`
- `craft-agent label move <id> --parent <id|root>`
- `craft-agent label reorder [--parent <id|root>] <ordered-id-1> <ordered-id-2> ...`

### Examples

```bash
craft-agent label list
craft-agent label get bug
craft-agent label create --name "Bug" --color "accent"
craft-agent label create --name "Priority" --value-type number
craft-agent label update bug --json '{"name":"Bug Report","color":"destructive"}'
craft-agent label move bug --parent root
craft-agent label reorder --parent root development content bug
```

### Notes
- Use `--json` / `--stdin` for nested or bulk updates.
- IDs are stable slugs generated from name on create.
<!-- cli:label:end -->

---

<!-- cli:source:start -->
## Source

Manage workspace sources stored under `sources/{slug}/`.

### Commands
- `craft-agent source list [--include-builtins true|false]`
- `craft-agent source get <slug>`
- `craft-agent source create --name "<name>" --provider "<provider>" --type mcp|api|local [--json '{...}']`
- `craft-agent source update <slug> --json '{...}'`
- `craft-agent source delete <slug>`
- `craft-agent source validate <slug>`
- `craft-agent source test <slug>`

### Examples

```bash
craft-agent source list
craft-agent source get linear
craft-agent source create --name "Linear" --provider "linear" --type mcp --json '{"mcp":{"transport":"http","url":"https://mcp.linear.app/sse","authType":"oauth"}}'
craft-agent source create --name "Docs Folder" --provider "filesystem" --type local --path "~/Documents"
craft-agent source update linear --json '{"enabled":false}'
craft-agent source validate linear
craft-agent source test linear
```

### Notes
- Prefer `--json` for type-specific nested config fields (`mcp`, `api`, `local`).
- `test` is lightweight CLI validation; for full in-session auth/connection probing use `source_test` MCP tool.
<!-- cli:source:end -->

---

<!-- cli:skill:start -->
## Skill

Manage workspace skills stored under `skills/{slug}/SKILL.md`.

### Commands
- `craft-agent skill list [--workspace-only]`
- `craft-agent skill get <slug>`
- `craft-agent skill where <slug> [--project-root <path>]`
- `craft-agent skill create --name "<name>" --description "<desc>" [--slug <slug>] [--body "..."]`
- `craft-agent skill update <slug> --json '{...}'`
- `craft-agent skill delete <slug>`
- `craft-agent skill validate <slug> [--source workspace|project|global]`

### Examples

```bash
craft-agent skill list
craft-agent skill where commit-helper
craft-agent skill create --name "Commit Helper" --description "Generate conventional commits" --slug commit-helper
craft-agent skill update commit-helper --json '{"requiredSources":["github"],"body":"Use concise, imperative commit messages."}'
craft-agent skill validate commit-helper
craft-agent skill delete commit-helper
```

### Notes
- `create` / `update` write `SKILL.md` frontmatter and content body.
- Use `where` to inspect project/workspace/global resolution precedence.
<!-- cli:skill:end -->

---

<!-- cli:automation:start -->
## Automation

Manage workspace automations stored in `automations.json`.

### Commands
- `craft-agent automation list`
- `craft-agent automation get <id>`
- `craft-agent automation create --event <EventName> [--prompt "..."] [--json '{...}']`
- `craft-agent automation update <id> [--event <EventName>] [--json '{...}']`
- `craft-agent automation delete <id>`
- `craft-agent automation enable <id>`
- `craft-agent automation disable <id>`
- `craft-agent automation duplicate <id>`
- `craft-agent automation history [<id>] [--limit <n>]`
- `craft-agent automation last-executed <id>`
- `craft-agent automation test <id> [--match "..."]`
- `craft-agent automation lint`
- `craft-agent automation validate`

### Examples

```bash
craft-agent automation list
craft-agent automation validate
craft-agent automation create --event UserPromptSubmit --prompt "Summarize this prompt"
craft-agent automation create --event SchedulerTick --json '{"cron":"0 9 * * 1-5","actions":[{"type":"prompt","prompt":"Daily summary"}]}'
craft-agent automation update abc123 --json '{"enabled":false}'
craft-agent automation enable abc123
craft-agent automation duplicate abc123
craft-agent automation history abc123 --limit 10
craft-agent automation last-executed abc123
craft-agent automation test abc123 --match "UserPromptSubmit"
craft-agent automation lint
craft-agent automation delete abc123
```

### Notes
- Prefer `--json` for matcher objects with `actions`, `cron`, `labels`, `permissionMode`.
- `lint` provides quick matcher/action hygiene checks (regex validity, missing actions, oversized prompt mention sets).
- `history` and `last-executed` read from `automations-history.jsonl` when present.
- `validate` runs full schema and semantic checks.
<!-- cli:automation:end -->

---

## Output contract

All commands return a single JSON envelope on stdout.

### Success
```json
{ "ok": true, "data": {}, "warnings": [] }
```

### Error
```json
{
  "ok": false,
  "error": {
    "code": "USAGE_ERROR",
    "message": "...",
    "suggestion": "..."
  },
  "warnings": []
}
```

Exit codes:
- `0` success
- `1` execution/internal failure
- `2` usage/validation/input failure
