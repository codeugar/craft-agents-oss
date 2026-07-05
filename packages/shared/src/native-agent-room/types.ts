export type TimestampMs = number;
export type AgentId = string;

export type RoomStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

export type RoomPhase =
  | 'clarify'
  | 'plan'
  | 'foundation'
  | 'design'
  | 'implementation'
  | 'review'
  | 'fix'
  | 'deliver';

export type TaskStatus =
  | 'todo'
  | 'in_progress'
  | 'blocked'
  | 'waiting_review'
  | 'changes_requested'
  | 'done';

export type ArtifactType =
  | 'requirements'
  | 'design_tokens'
  | 'design_guide'
  | 'component_guidelines'
  | 'ui_spec'
  | 'api_contract'
  | 'mock_data'
  | 'implementation'
  | 'test_plan'
  | 'qa_report'
  | 'seo_geo'
  | 'review_report'
  | 'shared_rules'
  | 'other';

export type ArtifactScope = 'project' | 'room' | 'task';
export type ArtifactStatus = 'draft' | 'approved' | 'deprecated';
export type DecisionScope = 'project' | 'room' | 'task';
export type DecisionStatus = 'proposed' | 'approved' | 'rejected' | 'superseded';

export type RoomBusActionType =
  | 'message'
  | 'ask_agent'
  | 'answer_agent'
  | 'raise_blocker'
  | 'resolve_blocker'
  | 'handoff_task'
  | 'request_review'
  | 'review_result'
  | 'propose_change'
  | 'artifact_update'
  | 'decision'
  | 'approval_request'
  | 'announcement';

export type InboxItemType =
  | 'mention'
  | 'request'
  | 'review_request'
  | 'blocker'
  | 'handoff'
  | 'artifact_update'
  | 'task_update'
  | 'decision_update'
  | 'announcement';

export type InboxItemStatus = 'unread' | 'read' | 'handled' | 'dismissed';
export type InboxItemPriority = 'low' | 'normal' | 'high' | 'blocking';

export type ContextSourceType =
  | 'role_contract'
  | 'member_directory'
  | 'current_task'
  | 'required_artifacts'
  | 'direct_mentions'
  | 'assigned_room_bus_events'
  | 'owned_task_updates'
  | 'owned_artifact_updates'
  | 'dependency_updates'
  | 'relevant_decisions'
  | 'room_timeline';

export type ContextExcludeRule =
  | 'full_transcript'
  | 'other_agents_private_memory'
  | 'unrelated_messages'
  | 'unrelated_rooms'
  | 'deprecated_artifacts'
  | 'rejected_decisions'
  | 'unrelated_resolved_events';

export type SubscriptionRule =
  | { type: 'artifact_type'; artifactType: ArtifactType }
  | { type: 'artifact'; artifactId: string }
  | { type: 'task'; taskId: string }
  | { type: 'decision_scope'; scope: DecisionScope };

export interface ArtifactRef {
  id: string;
  name: string;
  type: ArtifactType;
  scope: ArtifactScope;
  version: number;
  status: ArtifactStatus;
}

export interface TeamTemplateRef {
  id: string;
  name: string;
}

export interface RoomRef {
  id: string;
  name: string;
  status: RoomStatus;
  phase: RoomPhase;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  artifacts: Artifact[];
  teamTemplateIds: string[];
  roomIds: string[];
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
}

export interface WorkflowTemplateStep {
  id: string;
  phase: RoomPhase;
  title: string;
  roleKeys: string[];
}

export interface WorkflowTemplate {
  phases: RoomPhase[];
  steps: WorkflowTemplateStep[];
}

export interface RoomBusPolicy {
  allowedActions: RoomBusActionType[];
  maxRequestsPerAgentTurn: number;
  defaultTtlMs: number;
  maxHops: number;
}

export interface TeamTemplate {
  id: string;
  projectId?: string;
  name: string;
  description?: string;
  roles: RoleCard[];
  defaultWorkflow: WorkflowTemplate;
  roomBusPolicy: RoomBusPolicy;
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
}

export interface ContextPolicy {
  alwaysInclude: ContextSourceType[];
  requiredArtifactTypes: ArtifactType[];
  optionalArtifactTypes: ArtifactType[];
  includeEvents: RoomBusActionType[];
  exclude: ContextExcludeRule[];
  subscriptions: SubscriptionRule[];
}

export interface RoleCard {
  id: string;
  /** Provenance link to the workspace agent library entry this card was snapshotted from. */
  agentDefinitionId?: string;
  name: string;
  roleKey: string;
  mission: string;
  prompt: string;
  responsibilities: string[];
  inputs: string[];
  outputs: string[];
  allowedActions: RoomBusActionType[];
  forbiddenActions: string[];
  doneCriteria: string[];
  contextPolicy: ContextPolicy;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description?: string;
  roleKey: string;
  mission: string;
  prompt: string;
  responsibilities: string[];
  inputs: string[];
  outputs: string[];
  allowedActions: RoomBusActionType[];
  forbiddenActions: string[];
  doneCriteria: string[];
  contextPolicy: ContextPolicy;
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
}

export interface CreateAgentDefinitionInput {
  name: string;
  description?: string;
  roleKey: string;
  mission?: string;
  prompt: string;
  responsibilities?: string[];
  inputs?: string[];
  outputs?: string[];
  allowedActions?: RoomBusActionType[];
  forbiddenActions?: string[];
  doneCriteria?: string[];
  contextPolicy?: ContextPolicy;
}

export type UpdateAgentDefinitionInput = Partial<Omit<AgentDefinition, 'id' | 'createdAt' | 'updatedAt'>>;

export interface RoomMember {
  id: string;
  roomId: string;
  roleCardId: string;
  name: string;
  roleKey: string;
  sessionId: string;
  inboxId: string;
  status: 'idle' | 'working' | 'blocked' | 'waiting_review' | 'done';
  ownedTaskIds: string[];
  ownedArtifactIds: string[];
}

export interface InboxItem {
  id: string;
  eventId: string;
  type: InboxItemType;
  status: InboxItemStatus;
  priority: InboxItemPriority;
  createdAt: TimestampMs;
}

export interface AgentInbox {
  id: string;
  roomId: string;
  agentId: string;
  items: InboxItem[];
}

export interface Task {
  id: string;
  roomId: string;
  title: string;
  description: string;
  ownerAgentId: string;
  phase: RoomPhase;
  status: TaskStatus;
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  dependencyTaskIds: string[];
  doneCriteria: string[];
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
}

export interface ArtifactSection {
  id: string;
  title: string;
  contentRef: string;
}

export interface Artifact {
  id: string;
  projectId?: string;
  roomId?: string;
  taskId?: string;
  name: string;
  type: ArtifactType;
  scope: ArtifactScope;
  ownerAgentId?: string;
  version: number;
  status: ArtifactStatus;
  tags: string[];
  sections?: ArtifactSection[];
  contentRef: string;
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
}

export type TargetRef =
  | { type: 'agent'; id: string }
  | { type: 'role'; roleKey: string }
  | { type: 'all' }
  | { type: 'task'; id: string }
  | { type: 'artifact'; id: string };

export interface RoomBusEvent {
  id: string;
  projectId: string;
  roomId: string;
  from: AgentId | 'user' | 'system';
  to?: TargetRef[];
  type: RoomBusActionType;
  taskId?: string;
  artifactId?: string;
  decisionId?: string;
  payload: Record<string, unknown>;
  status: 'open' | 'resolved' | 'rejected' | 'expired';
  createdAt: TimestampMs;
  resolvedAt?: TimestampMs;
  parentEventId?: string;
  expiresAt?: TimestampMs;
  hopCount?: number;
  maxHops?: number;
}

export interface Decision {
  id: string;
  projectId: string;
  roomId?: string;
  title: string;
  description: string;
  scope: DecisionScope;
  status: DecisionStatus;
  relatedTaskIds: string[];
  relatedArtifactIds: string[];
  createdBy: AgentId | 'user' | 'system';
  approvedBy?: 'user' | AgentId;
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
}

export interface TimelineItem {
  id: string;
  roomId: string;
  title: string;
  description: string;
  phase: RoomPhase;
  sourceEventIds: string[];
  sourceArtifactIds: string[];
  sourceDecisionIds: string[];
  createdAt: TimestampMs;
}

export interface Room {
  id: string;
  projectId: string;
  templateId?: string;
  forkedFromRoomId?: string;
  name: string;
  goal: string;
  status: RoomStatus;
  phase: RoomPhase;
  workflow?: WorkflowTemplate;
  roomBusPolicy?: RoomBusPolicy;
  roleCards: RoleCard[];
  members: RoomMember[];
  tasks: Task[];
  artifacts: Artifact[];
  decisions: Decision[];
  events: RoomBusEvent[];
  inboxes: AgentInbox[];
  timeline: TimelineItem[];
  /** Per-agent-turn execution records; absent on rooms created before M3. */
  turnLogs?: TurnLog[];
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
}

export interface TurnLog {
  id: string;
  roomId: string;
  agentId: string;
  triggerEventId?: string;
  publishedEventIds: string[];
  rejectedActionCount: number;
  contextUsed: ContextUsedItem[];
  /** Raw runner/LLM response for observability and debugging. */
  rawResponse?: string;
  createdAt: TimestampMs;
}

export interface RoomMemberSummary {
  id: string;
  name: string;
  roleKey: string;
  status: RoomMember['status'];
  responsibilities: string[];
  allowedActions: RoomBusActionType[];
}

export interface ContextUsedItem {
  type: 'role' | 'member_directory' | 'task' | 'artifact' | 'event' | 'decision' | 'timeline' | 'inbox';
  id: string;
  label: string;
}

export interface ContextPack {
  agentId: string;
  roomId: string;
  taskId?: string;
  triggerEventId?: string;
  roleContext: RoleCard;
  memberDirectory: RoomMemberSummary[];
  currentTask?: Task;
  requiredArtifacts: Artifact[];
  relevantDecisions: Decision[];
  attentionEvents: RoomBusEvent[];
  inboxItems: InboxItem[];
  timeline: TimelineItem[];
  contextUsed: ContextUsedItem[];
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  artifacts?: Artifact[];
}

export interface CreateTeamTemplateInput {
  projectId?: string;
  name: string;
  description?: string;
  roles: RoleCard[];
  defaultWorkflow: WorkflowTemplate;
  roomBusPolicy: RoomBusPolicy;
}

export interface CreateRoomRecordInput {
  projectId: string;
  templateId?: string;
  name: string;
  goal: string;
  status?: RoomStatus;
  phase?: RoomPhase;
  workflow?: WorkflowTemplate;
  roomBusPolicy?: RoomBusPolicy;
  roleCards?: RoleCard[];
  members?: RoomMember[];
  tasks?: Task[];
  artifacts?: Artifact[];
  decisions?: Decision[];
  events?: RoomBusEvent[];
  inboxes?: AgentInbox[];
  timeline?: TimelineItem[];
}

export interface RoomAvailableArtifacts {
  projectArtifacts: Artifact[];
  roomArtifacts: Artifact[];
  taskArtifacts: Artifact[];
}
