# Native Agent Room Implementation Log

## 2026-07-02: Repository Inspection and P0 Blocker

Milestone completed: none. P0 has not started.

Files changed:

- `native-agent-room-blueprint-v0.1.md`
- `docs/native-agent-room-implementation-plan.md`
- `docs/native-agent-room-implementation-log.md`

Behavior added:

- Saved the Blueprint into the project root.
- Added a P0-P3 implementation plan based on the Blueprint.
- Recorded that the current worktree has no editable Craft Agents source code.

Verification commands run:

- `find . -maxdepth 4 -not -path './.git/*' -print | sort`
- `git status -sb`
- `git remote -v`
- `sed -n '1,260p' native-agent-room-blueprint-v0.1.md`
- `sed -n '261,620p' native-agent-room-blueprint-v0.1.md`
- `sed -n '620,1125p' native-agent-room-blueprint-v0.1.md`
- `sed -n '1126,1605p' native-agent-room-blueprint-v0.1.md`
- `sed -n '1606,1935p' native-agent-room-blueprint-v0.1.md`
- `find /Applications/Craft\ Agents.app/Contents/Resources/app -maxdepth 2 -type f`
- `sed -n '1,220p' /Applications/Craft\ Agents.app/Contents/Resources/app/package.json`
- `git -C /Applications/Craft\ Agents.app/Contents/Resources/app status -sb`

Result:

- Current project worktree only contained `.git` and the Blueprint before this log/plan were added.
- No `package.json`, `src`, `packages`, `lib`, `server`, `app`, test files, build config, or persistence layer exist in the current worktree.
- The installed app bundle contains application resources, but it is not a git repository and its TypeScript/package files are not an editable source worktree for this project.
- No test, typecheck, or build command is available in the current worktree.

Known gaps:

- Existing Craft Agents data model, storage, API, UI, test, and agent/session patterns cannot be identified from the current worktree because the source code is absent.
- P0 data model and persistence cannot be implemented or verified until the editable source repository is available.

Next milestone:

- P0: Data model and persistence, after the correct Craft Agents source repository is provided or placed in this project.

## 2026-07-02: Source Availability Recheck

Milestone completed: none. P0 is still blocked.

Files changed:

- `docs/native-agent-room-implementation-log.md`

Behavior added:

- Rechecked whether editable Craft Agents source code had been added to the current project.
- Checked whether the installed app bundle could be treated as a complete source workspace.

Verification commands run:

- `find . -maxdepth 4 -not -path './.git/*' -print | sort`
- `git status -sb`
- `find /Applications/Craft\ Agents.app/Contents/Resources/app -maxdepth 2 -type f \( -name 'package.json' -o -name 'pnpm-workspace.yaml' -o -name 'yarn.lock' -o -name 'pnpm-lock.yaml' -o -name 'package-lock.json' -o -name 'turbo.json' -o -name 'vitest.config.*' -o -name 'tsconfig.json' \) -print | sort`
- `find /Applications/Craft\ Agents.app/Contents/Resources/app/packages -maxdepth 2 -type d -print | sort`
- `rg -n "workspace:\*|scripts|test|typecheck|build" /Applications/Craft\ Agents.app/Contents/Resources/app/package.json`

Result:

- Current project still has no editable Craft Agents application source, package manifest, tests, persistence layer, API layer, or UI layer.
- The installed app bundle exposes some TypeScript files, but it is not a git repository.
- Its `package.json` depends on `@craft-agent/core`, `@craft-agent/messaging-gateway`, `@craft-agent/server-core`, `@craft-agent/shared`, and `@craft-agent/ui` via `workspace:*`.
- The app bundle only contains `packages/shared` under `packages/`, so it is not a complete workspace and cannot be reliably used for P0-P3 implementation or verification.

Known gaps:

- P0-P3 still require the editable Craft Agents source repository.
- No relevant test/typecheck/build command is available in the current project.

Next milestone:

- P0: Data model and persistence, once the correct source repository is available.

## 2026-07-02: OSS Repository Attached

Milestone completed: setup only. P0 has not started.

Files changed:

- `docs/native-agent-room-implementation-plan.md`
- `docs/native-agent-room-implementation-log.md`

Behavior added:

- Added `https://github.com/craft-ai-agents/craft-agents-oss.git` as `origin`.
- Fetched `origin/main` and checked out the OSS source into the current worktree.
- Updated the implementation plan to target `packages/shared/src/native-agent-room/` with workspace-scoped JSON persistence.

Verification commands run:

- `git remote add origin https://github.com/craft-ai-agents/craft-agents-oss.git`
- `git fetch origin main`
- `git ls-tree -r --name-only origin/main | rg '^(native-agent-room-blueprint-v0\.1\.md|docs/native-agent-room-implementation-(plan|log)\.md)$'`
- `git checkout -B main origin/main`
- `git status -sb`
- `sed -n '1,240p' package.json`
- `sed -n '1,260p' packages/shared/package.json`
- `sed -n '1,320p' packages/shared/src/workspaces/storage.ts`
- `sed -n '1,340p' packages/shared/src/sessions/storage.ts`
- `sed -n '1,260p' packages/shared/src/statuses/storage.ts`
- `sed -n '1,220p' packages/shared/src/views/storage.ts`

Result:

- The current worktree now contains the Craft Agents OSS monorepo.
- Existing storage and tests are file-based, workspace-scoped, and centered in `packages/shared`.
- No P0 implementation has been made yet.

Known gaps:

- Native Agent Room objects, persistence, room operations, RoomBus, inbox routing, attention routing, and ContextPack generation still need implementation.

Next milestone:

- P0: Data model and persistence.

## 2026-07-02: P0 Data Model and Persistence

Milestone completed: P0.

Files changed:

- `packages/shared/package.json`
- `packages/shared/src/native-agent-room/index.ts`
- `packages/shared/src/native-agent-room/storage.ts`
- `packages/shared/src/native-agent-room/types.ts`
- `packages/shared/src/native-agent-room/__tests__/storage.test.ts`
- `docs/native-agent-room-implementation-log.md`

Behavior added:

- Added Native Agent Room domain types for Project, Room, TeamTemplate, RoleCard, RoomMember, Task, Artifact, Decision, RoomBusEvent, AgentInbox, TimelineItem, and ContextPack.
- Added workspace-scoped JSON persistence under `{workspaceRootPath}/native-agent-room/`.
- Added CRUD helpers for projects, team templates, rooms, project artifacts, and room-available artifacts.
- Added public shared package export `@craft-agent/shared/native-agent-room`.
- Preserved existing app behavior by not wiring UI/API/runtime paths yet.

Verification commands run:

- `bun install`
- `bun test packages/shared/src/native-agent-room/__tests__/storage.test.ts`
- `bun run typecheck:shared`

Result:

- P0 focused test passed: 3 tests, 12 assertions.
- Shared package typecheck passed.

Known gaps:

- Room creation flows are not implemented yet.
- RoomBus events do not route to inboxes yet.
- ContextPack generation and attention routing are not implemented yet.
- No polished UI was added by design.

Next milestone:

- P1: Room creation and role configuration.

## 2026-07-02: P1 Room Creation and Role Configuration

Milestone completed: P1.

Files changed:

- `packages/shared/src/native-agent-room/types.ts`
- `packages/shared/src/native-agent-room/storage.ts`
- `packages/shared/src/native-agent-room/index.ts`
- `packages/shared/src/native-agent-room/room-operations.ts`
- `packages/shared/src/native-agent-room/__tests__/room-operations.test.ts`
- `docs/native-agent-room-implementation-log.md`

Behavior added:

- Added room-level workflow and RoomBus policy configuration snapshots.
- Implemented Create Room from Team Template.
- Implemented Duplicate Room Config without copying tasks, artifacts, decisions, events, timeline, or inbox item history.
- Implemented Fork Room with copied history and remapped room-scoped ids.
- Implemented Save Room as Team Template using only role, workflow, and RoomBus policy configuration.
- Implemented room role prompt editing without mutating the source template.

Verification commands run:

- `bun test packages/shared/src/native-agent-room/__tests__/storage.test.ts packages/shared/src/native-agent-room/__tests__/room-operations.test.ts`
- `bun run typecheck:shared`

Result:

- Native Agent Room P0/P1 focused tests passed: 8 tests, 51 assertions.
- Shared package typecheck passed.

Known gaps:

- RoomBus protocol validation and inbox routing are not implemented yet.
- Attention routing and ContextPack generation are not implemented yet.
- No polished UI was added by design.

Next milestone:

- P2: RoomBus and Agent Inbox.

## 2026-07-02: P2 RoomBus and Agent Inbox

Milestone completed: P2.

Files changed:

- `packages/shared/src/native-agent-room/index.ts`
- `packages/shared/src/native-agent-room/room-bus.ts`
- `packages/shared/src/native-agent-room/__tests__/room-bus.test.ts`
- `docs/native-agent-room-implementation-log.md`

Behavior added:

- Implemented RoomBus event publishing.
- Implemented target resolution for agent, role, all, task, and artifact targets.
- Implemented mechanical validation for event type, resolvable targets, request `expectedOutput`, TTL/max hops, and simple parent-chain loop prevention.
- Implemented inbox routing for target agents and sender tracking for open request events.
- Implemented parent request resolution for answer/review/resolve responses.
- Implemented minimal task status updates for review/blocker events.

Verification commands run:

- `bun test packages/shared/src/native-agent-room/__tests__/storage.test.ts packages/shared/src/native-agent-room/__tests__/room-operations.test.ts packages/shared/src/native-agent-room/__tests__/room-bus.test.ts`
- `bun run typecheck:shared`

Result:

- Native Agent Room P0-P2 focused tests passed: 14 tests, 67 assertions.
- Shared package typecheck passed.

Known gaps:

- `@Agent`, `@Role`, `@all`, `@task`, and `@artifact` attention signals are not implemented yet.
- ContextPack generation is not implemented yet.
- No polished UI was added by design.

Next milestone:

- P3: Attention Model and Context Resolver.

## 2026-07-02: P3 Attention Model and Context Resolver

Milestone completed: P3.

Files changed:

- `packages/shared/src/native-agent-room/index.ts`
- `packages/shared/src/native-agent-room/attention.ts`
- `packages/shared/src/native-agent-room/room-bus.ts`
- `packages/shared/src/native-agent-room/__tests__/attention.test.ts`
- `docs/native-agent-room-implementation-log.md`

Behavior added:

- Implemented explicit attention parsing for `@Agent`, `@Role`, `@all`, `@task:<id>`, and `@artifact:<id>`.
- Implemented implicit routing for task owners, artifact owners, dependent task owners, and decision relevance.
- Integrated attention routing into RoomBus event publishing so messages and updates enter the relevant Agent Inboxes.
- Implemented ContextPack generation with RoleCard, Member Directory, Current Task, Required Artifacts, Relevant Decisions, Attention Events, Inbox Items, Timeline, and Context Used.
- Excluded deprecated artifacts, rejected decisions, unrelated room content, and unrelated transcript events from ContextPack results.

Verification commands run:

- `bun test packages/shared/src/native-agent-room/__tests__/storage.test.ts packages/shared/src/native-agent-room/__tests__/room-operations.test.ts packages/shared/src/native-agent-room/__tests__/room-bus.test.ts packages/shared/src/native-agent-room/__tests__/attention.test.ts`
- `bun run typecheck:shared`

Result:

- Native Agent Room P0-P3 focused tests passed: 19 tests, 89 assertions.
- Shared package typecheck passed.

Known gaps:

- P4 Artifact/Decision system hardening is not implemented.
- P5 automatic Room Timeline generation is not implemented.
- P6 polished three-column UI is not implemented.
- Native Agent Room is available as shared business logic; app UI/API wiring remains future work.

Next milestone:

- P4, outside the requested scope.

## 2026-07-02: Final P0-P3 Verification

Milestone completed: P0-P3 final verification.

Files changed:

- `docs/native-agent-room-implementation-log.md`

Behavior added:

- Restored unrelated `bun.lock` churn caused by dependency installation.
- Re-ran final P0-P3 verification after restoring the lockfile.

Verification commands run:

- `bun test packages/shared/src/native-agent-room/__tests__/storage.test.ts packages/shared/src/native-agent-room/__tests__/room-operations.test.ts packages/shared/src/native-agent-room/__tests__/room-bus.test.ts packages/shared/src/native-agent-room/__tests__/attention.test.ts`
- `bun run typecheck:shared`

Result:

- Native Agent Room P0-P3 focused tests passed: 19 tests, 89 assertions.
- Shared package typecheck passed.

Known gaps:

- Same as P3: UI/API wiring and P4+ are outside the requested scope.

Next milestone:

- None for this request.

## 2026-07-03: M1 Agent Library (Agent-Library-Centric Model)

Milestone completed: M1.

Design decision (user-confirmed): the product model is agent-library-centric, not
template-centric. Agents are workspace-level entities users create and reuse;
rooms reference agents and snapshot their config on join; TeamTemplate becomes a
saved combination of agent snapshots + workflow + RoomBus policy.

Files changed:

- `packages/shared/src/native-agent-room/types.ts`
- `packages/shared/src/native-agent-room/storage.ts`
- `packages/shared/src/native-agent-room/agent-library.ts`
- `packages/shared/src/native-agent-room/room-operations.ts`
- `packages/shared/src/native-agent-room/index.ts`
- `packages/shared/src/native-agent-room/__tests__/agent-library.test.ts`
- `docs/native-agent-room-implementation-log.md`

Behavior added:

- Added `AgentDefinition` workspace-level agent library with CRUD, persisted under
  `{workspaceRootPath}/native-agent-room/agents/`.
- Added `agentDefinitionId` provenance on `RoleCard` and
  `roleCardFromAgentDefinition` snapshot helper (deep copy, fresh role id).
- Added `createRoomWithAgents` (build a room directly from library agents, no
  template required) and `addAgentToRoom` (add a library agent to an existing room
  with role card, member, and inbox).
- Added `createTeamTemplateFromAgents` (template as an agent combination with
  provenance).
- `createRoomFromTemplate` now resolves template roles library-first: roles whose
  `agentDefinitionId` still exists use the current library version; deleted agents
  fall back to the template snapshot.
- Snapshot semantics: editing a library agent does not mutate existing rooms;
  room-level prompt overrides do not write back to the library.

Verification commands run:

- `bun test packages/shared/src/native-agent-room/__tests__/`
- `bun run typecheck:shared`

Result:

- Native Agent Room P0-P3 + M1 tests passed: 34 tests, 144 assertions.
- Shared package typecheck passed.

Known gaps:

- M2 runtime wiring (session binding, RoomBus session tools, ContextPack prompt
  building, event-driven scheduling) is not implemented yet.
- No UI for the agent library or rooms yet (M3).

Next milestone:

- M2: runtime vertical slice.
