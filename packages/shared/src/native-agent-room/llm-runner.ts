import type { AgentRunner, AgentTurnAction, AgentTurnInput } from './room-runtime.ts';
import type { RoomBusActionType } from './types.ts';

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

function parseActions(text: string, allowedActions: RoomBusActionType[]): AgentTurnAction[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  const actions = (parsed as { actions?: unknown })?.actions;
  if (!Array.isArray(actions)) return [];

  return actions.filter((action): action is AgentTurnAction => {
    if (typeof action !== 'object' || action === null) return false;
    const candidate = action as Record<string, unknown>;
    return (
      typeof candidate.type === 'string' &&
      allowedActions.includes(candidate.type as RoomBusActionType) &&
      typeof candidate.payload === 'object' &&
      candidate.payload !== null
    );
  });
}

export function createLlmAgentRunner(options: CreateLlmAgentRunnerOptions): AgentRunner {
  return async (input: AgentTurnInput) => {
    const result = await options.queryLlm({
      prompt: [
        input.prompt.userPrompt,
        '',
        'Respond with a JSON object of RoomBus actions to take now.',
        'Return {"actions": []} if no action is needed.',
      ].join('\n'),
      systemPrompt: input.prompt.systemPrompt,
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      outputSchema: buildActionSchema(input.allowedActions),
    });

    return { actions: parseActions(result.text, input.allowedActions) };
  };
}
