# Native Agent Room Implementation Plan

Source of truth: [native-agent-room-blueprint-v0.1.md](../native-agent-room-blueprint-v0.1.md)

## Current Repository State

The current git worktree is based on `craft-ai-agents/craft-agents-oss` at `origin/main`.

Relevant existing patterns:

- Monorepo package manager: Bun.
- Shared domain logic lives under `packages/shared/src`.
- Workspace-scoped persistence uses files under the workspace root, for example `sessions/`, `statuses/config.json`, `views.json`, and `sources/`.
- Tests use `bun:test` with temporary workspace directories.
- Existing timestamps use millisecond numbers, so Native Agent Room storage follows that convention while preserving the Blueprint object model.

Implementation landing zone:

- `packages/shared/src/native-agent-room/`
- Persisted files under `{workspaceRootPath}/native-agent-room/`
- Public export path: `@craft-agent/shared/native-agent-room`

## Implementation Principles

- Implement only Blueprint milestones P0 through P3.
- Preserve existing Craft Agents behavior unless a change is required by P0-P3.
- Keep Project, Room, Team Template, RoomBus Event, Agent Inbox, Task, Artifact, Decision, Timeline, and Context Pack as structured facts.
- Do not implement polished full UI, complex DAG scheduling, automatic parallel execution, deployment, or unrelated refactors.
- Do not advance to the next milestone until the previous milestone is implemented and verified.

## P0: Data Model and Persistence

Goal: Craft Agents natively knows Project and Room exist.

Implementation:

- Add domain types for Project, Room, TeamTemplate, RoleCard, RoomMember, Task, Artifact, Decision, RoomBusEvent, AgentInbox, TimelineItem, and ContextPack.
- Add filesystem storage adapters following the existing workspace-scoped JSON persistence pattern.
- Add repository/service functions for create/read/update operations needed by later milestones.
- Add focused tests for serialization, persistence, and basic relations:
  - Project owns rooms, artifacts, and team templates.
  - Room owns members, tasks, artifacts, decisions, events, inboxes, and timeline items.
  - Project-level artifacts can be referenced by rooms.

Verification gate:

- Run the repository's relevant unit tests and typecheck/build command.
- P1 must not start until P0 passes.

## P1: Room Creation and Role Configuration

Goal: users can create rooms and configure multiple agent roles.

Implementation once P0 is verified:

- Implement Create Room from Team Template.
- Implement Duplicate Room Config without copying history, artifacts, tasks, decisions, inboxes, or timeline.
- Implement Fork Room with copied history, artifacts, tasks, decisions, timeline, and context state.
- Implement Save Room as Team Template with only role, prompt, workflow, context policy, and RoomBus policy.
- Add the minimal role prompt editing path required by existing UI/API conventions.

Verification gate:

- Tests prove the four creation/copy flows copy only the Blueprint-approved state.
- Run typecheck/build and relevant UI/API tests.
- P2 must not start until P1 passes.

## P2: RoomBus and Agent Inbox

Goal: agents communicate through controlled protocol events that populate the right inboxes.

Implementation once P1 is verified:

- Implement RoomBus events for ask_agent, answer_agent, raise_blocker, request_review, review_result, handoff_task, artifact_update, and announcement.
- Validate target existence, event type, request expectedOutput, TTL/max hops, and simple loop prevention.
- Route direct RoomBus requests to target Agent Inboxes.
- Keep event records observable and linked to task/artifact/decision where present.

Verification gate:

- Tests prove direct target routing and request validation.
- Run typecheck/build and relevant service/API tests.
- P3 must not start until P2 passes.

## P3: Attention Model and Context Resolver

Goal: an agent reads a Context Pack instead of the full transcript.

Implementation once P2 is verified:

- Route @Agent, @Role, @all, @task, and @artifact attention signals.
- Route implicit task owner, artifact owner, dependency update, and decision relevance signals.
- Generate ContextPack containing RoleCard, Member Directory, Current Task, Required Artifacts, Direct Mentions, Assigned RoomBus Events, Relevant Decisions, Room Timeline, InboxItems, and ContextUsed.
- Exclude full transcript, private memory, unrelated rooms, unrelated historical events, deprecated artifacts, and rejected decisions.

Verification gate:

- Tests prove included and excluded context for at least the Blueprint's Frontend/Pricing Page scenario.
- Run typecheck/build and relevant service/API tests.

## Out of Scope for P0-P3

- Polished Room UI.
- Complex DAG scheduling.
- Automatic parallel execution.
- Deployment or release packaging.
- Broad rewrites of the existing session UI.
