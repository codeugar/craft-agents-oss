import { isRequestAction } from './room-bus.ts';
import type { AgentRunner, AgentTurnAction, AgentTurnInput } from './room-runtime.ts';
import type { RoomBusActionType, RoomMemberSummary, TargetRef } from './types.ts';

/**
 * Structurally compatible with `BaseAgent.queryLlm` (packages/shared/src/agent).
 * Kept as a local interface so the room runtime stays decoupled from a concrete
 * backend: production passes `(req) => backend.queryLlm(req)`, tests pass a stub.
 */
export interface RoomLlmQuery {
  (request: {
    prompt: string;
    systemPrompt?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    outputSchema?: Record<string, unknown>;
  }): Promise<{ text: string }>;
}

export interface CreateLlmAgentRunnerOptions {
  queryLlm: RoomLlmQuery;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

const DEFAULT_EXPECTED_OUTPUT = 'A direct, actionable answer';

function buildActionSchema(allowedActions: RoomBusActionType[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: allowedActions },
            to: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['agent', 'role', 'all', 'task', 'artifact'] },
                  id: { type: 'string' },
                  roleKey: { type: 'string' },
                },
                required: ['type'],
              },
            },
            taskId: { type: 'string' },
            artifactId: { type: 'string' },
            parentEventId: { type: 'string' },
            payload: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                expectedOutput: { type: 'string' },
              },
              required: ['message'],
            },
          },
          required: ['type', 'payload'],
        },
      },
    },
    required: ['actions'],
  };
}

function extractJsonPayload(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();

  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;

  // Fall back to the outermost object in prose-wrapped output.
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function resolveTargetString(value: string, members: RoomMemberSummary[]): TargetRef | null {
  const normalized = normalizeToken(value.replace(/^@/, ''));
  if (normalized === 'all' || normalized === 'everyone') return { type: 'all' };

  const member = members.find(
    (item) =>
      normalizeToken(item.id) === normalized ||
      normalizeToken(item.name) === normalized ||
      normalizeToken(item.roleKey) === normalized,
  );
  if (member) return { type: 'agent', id: member.id };
  return null;
}

function normalizeTargets(raw: unknown, members: RoomMemberSummary[]): TargetRef[] | undefined {
  if (raw === undefined || raw === null) return undefined;

  const items = Array.isArray(raw) ? raw : [raw];
  const targets: TargetRef[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      const resolved = resolveTargetString(item, members);
      if (resolved) targets.push(resolved);
      continue;
    }
    if (typeof item === 'object' && item !== null && typeof (item as { type?: unknown }).type === 'string') {
      targets.push(item as TargetRef);
    }
  }
  return targets.length > 0 ? targets : undefined;
}

/**
 * Models frequently deviate from the requested action shape (`action` instead
 * of `type`, a bare role string as `to`, `message` at the top level). Normalize
 * the common variants instead of silently dropping the turn.
 */
function normalizeAction(
  raw: unknown,
  input: AgentTurnInput,
): AgentTurnAction | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;

  const type = (candidate.type ?? candidate.action) as RoomBusActionType | undefined;
  if (typeof type !== 'string' || !input.allowedActions.includes(type)) return null;

  const payload: Record<string, unknown> =
    typeof candidate.payload === 'object' && candidate.payload !== null
      ? { ...(candidate.payload as Record<string, unknown>) }
      : {};
  if (typeof candidate.message === 'string' && payload.message === undefined) {
    payload.message = candidate.message;
  }
  if (typeof candidate.expectedOutput === 'string' && payload.expectedOutput === undefined) {
    payload.expectedOutput = candidate.expectedOutput;
  }
  if (isRequestAction(type) && typeof payload.expectedOutput !== 'string') {
    payload.expectedOutput = DEFAULT_EXPECTED_OUTPUT;
  }

  return {
    type,
    to: normalizeTargets(candidate.to, input.contextPack.memberDirectory),
    taskId: typeof candidate.taskId === 'string' ? candidate.taskId : undefined,
    artifactId: typeof candidate.artifactId === 'string' ? candidate.artifactId : undefined,
    decisionId: typeof candidate.decisionId === 'string' ? candidate.decisionId : undefined,
    parentEventId: typeof candidate.parentEventId === 'string' ? candidate.parentEventId : undefined,
    payload,
  };
}

function parseActions(text: string, input: AgentTurnInput): AgentTurnAction[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonPayload(text));
  } catch {
    return [];
  }

  const actions = (parsed as { actions?: unknown })?.actions;
  if (!Array.isArray(actions)) return [];

  return actions
    .map((action) => normalizeAction(action, input))
    .filter((action): action is AgentTurnAction => action !== null);
}

function buildInstruction(input: AgentTurnInput): string {
  const memberIds = input.contextPack.memberDirectory
    .map((member) => `${member.id} (${member.name}, ${member.roleKey})`)
    .join('; ');
  return [
    'Respond ONLY with a JSON object of RoomBus actions to take now, no prose.',
    'Exact format: {"actions":[{"type":"ask_agent","to":[{"type":"agent","id":"<memberId>"}],"payload":{"message":"...","expectedOutput":"..."}}]}',
    `Member ids: ${memberIds}.`,
    'Request actions (ask_agent, handoff_task, request_review, approval_request) require payload.expectedOutput.',
    'To answer an open request, use answer_agent with parentEventId set to that request event id.',
    'Return {"actions": []} if no action is needed.',
  ].join('\n');
}

export function createLlmAgentRunner(options: CreateLlmAgentRunnerOptions): AgentRunner {
  return async (input: AgentTurnInput) => {
    const result = await options.queryLlm({
      prompt: [input.prompt.userPrompt, '', buildInstruction(input)].join('\n'),
      systemPrompt: input.prompt.systemPrompt,
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      outputSchema: buildActionSchema(input.allowedActions),
    });

    return { actions: parseActions(result.text, input), rawText: result.text };
  };
}
