import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { addProjectArtifact, createProject, loadRoom } from '../storage.ts';
import { createAgentDefinition } from '../agent-library.ts';
import { createRoomWithAgents } from '../room-operations.ts';
import { resolveContextPack } from '../attention.ts';
import { publishRoomBusEvent } from '../room-bus.ts';
import { buildAgentTurnPrompt, runAgentTurn, runRoomScheduler } from '../room-runtime.ts';
import type { AgentRunner } from '../room-runtime.ts';
import { createLlmAgentRunner } from '../llm-runner.ts';
import type { Artifact, CreateAgentDefinitionInput, Room } from '../types.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeWorkspaceRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'native-agent-room-m2-'));
  tempDirs.push(dir);
  return dir;
}

function makeAgentInput(roleKey: string, name: string): CreateAgentDefinitionInput {
  return {
    name,
    roleKey,
    mission: `${name} mission`,
    prompt: `You are the ${name}.`,
    responsibilities: [`${name} responsibility`],
    allowedActions: ['ask_agent', 'answer_agent', 'request_review', 'review_result', 'artifact_update', 'announcement'],
  };
}

function makeArtifact(id: string, name: string, type: Artifact['type']): Artifact {
  const now = Date.now();
  return {
    id,
    name,
    type,
    scope: 'project',
    version: 3,
    status: 'approved',
    tags: [],
    contentRef: `artifacts/${name}`,
    createdAt: now,
    updatedAt: now,
  };
}

function setupPricingRoom(root: string): { room: Room; projectId: string } {
  const project = createProject(root, { name: 'Acme SaaS Website' });
  addProjectArtifact(root, project.id, makeArtifact('artifact_tokens', 'design-tokens.json', 'design_tokens'));

  const frontend = createAgentDefinition(root, {
    ...makeAgentInput('frontend', 'Frontend Agent'),
    contextPolicy: {
      alwaysInclude: ['role_contract', 'member_directory', 'current_task'],
      requiredArtifactTypes: ['design_tokens', 'ui_spec', 'api_contract'],
      optionalArtifactTypes: [],
      includeEvents: ['ask_agent', 'answer_agent', 'artifact_update'],
      exclude: ['full_transcript'],
      subscriptions: [],
    },
  });
  const backend = createAgentDefinition(root, makeAgentInput('backend', 'Backend API Agent'));

  const room = createRoomWithAgents(root, {
    projectId: project.id,
    name: 'Pricing Page Room',
    goal: 'Build the pricing page',
    agentDefinitionIds: [frontend.id, backend.id],
  });
  return { room, projectId: project.id };
}

describe('buildAgentTurnPrompt', () => {
  it('renders role, member directory, mentions, and artifacts from the context pack', () => {
    const root = makeWorkspaceRoot();
    const { room } = setupPricingRoom(root);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;

    publishRoomBusEvent(root, {
      roomId: room.id,
      from: 'user',
      type: 'message',
      payload: { message: '@Frontend please confirm the annual toggle state handling.' },
    });

    const pack = resolveContextPack(root, { roomId: room.id, agentId: frontend.id });
    const prompt = buildAgentTurnPrompt(pack);

    // system prompt carries the role contract
    expect(prompt.systemPrompt).toContain('You are the Frontend Agent.');
    expect(prompt.systemPrompt).toContain('Frontend Agent mission');

    // member directory tells the agent who else is in the room
    expect(prompt.userPrompt).toContain('Backend API Agent');
    expect(prompt.userPrompt).toContain('backend');

    // attention events carry the mention text
    expect(prompt.userPrompt).toContain('annual toggle');

    // required artifacts render with name and version
    expect(prompt.userPrompt).toContain('design-tokens.json@v3');

    // the agent is told which actions it may take
    expect(prompt.userPrompt).toContain('ask_agent');
  });
});

describe('runAgentTurn', () => {
  it('publishes valid actions, rejects disallowed ones, and marks inbox items handled', async () => {
    const root = makeWorkspaceRoot();
    const { room } = setupPricingRoom(root);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;

    publishRoomBusEvent(root, {
      roomId: room.id,
      from: 'user',
      type: 'message',
      payload: { message: '@Frontend implement the pricing page.' },
    });

    const runner: AgentRunner = (input) => {
      // the runner receives the rendered prompt and the pack
      expect(input.prompt.systemPrompt).toContain('You are the Frontend Agent.');
      expect(input.contextPack.agentId).toBe(frontend.id);
      return {
        actions: [
          {
            type: 'ask_agent',
            to: [{ type: 'agent', id: backend.id }],
            payload: {
              message: 'api-contract is missing yearlyPrice, please provide it.',
              expectedOutput: 'Updated API contract artifact',
            },
          },
          {
            // 'decision' is not in the frontend role's allowedActions
            type: 'decision',
            payload: { message: 'I decide the design tokens are final.' },
          },
        ],
      };
    };

    const result = await runAgentTurn(root, { roomId: room.id, agentId: frontend.id, runner });

    expect(result.publishedEvents).toHaveLength(1);
    expect(result.publishedEvents[0]!.type).toBe('ask_agent');
    expect(result.publishedEvents[0]!.from).toBe(frontend.id);
    expect(result.rejectedActions).toHaveLength(1);
    expect(result.rejectedActions[0]!.reason).toContain('not allowed');

    const reloaded = loadRoom(root, room.id)!;
    // the ask_agent event reached the backend inbox
    const backendInbox = reloaded.inboxes.find((inbox) => inbox.agentId === backend.id)!;
    expect(backendInbox.items.some((item) => item.type === 'request')).toBe(true);

    // after the turn nothing in the frontend inbox is unread: the triggering
    // mention is handled, and the sender's own request-tracking item is 'read'
    const frontendInbox = reloaded.inboxes.find((inbox) => inbox.agentId === frontend.id)!;
    expect(frontendInbox.items.length).toBeGreaterThan(0);
    expect(frontendInbox.items.some((item) => item.status === 'handled')).toBe(true);
    expect(frontendInbox.items.every((item) => item.status !== 'unread')).toBe(true);
  });

  it('enforces the per-turn request cap from the room bus policy', async () => {
    const root = makeWorkspaceRoot();
    const { room } = setupPricingRoom(root);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;

    const askBackend = (n: number) => ({
      type: 'ask_agent' as const,
      to: [{ type: 'agent' as const, id: backend.id }],
      payload: { message: `question ${n}`, expectedOutput: `answer ${n}` },
    });
    // default policy allows 3 requests per turn; the 4th must be rejected
    const runner: AgentRunner = () => ({ actions: [askBackend(1), askBackend(2), askBackend(3), askBackend(4)] });

    const result = await runAgentTurn(root, { roomId: room.id, agentId: frontend.id, runner });

    expect(result.publishedEvents).toHaveLength(3);
    expect(result.rejectedActions).toHaveLength(1);
    expect(result.rejectedActions[0]!.reason).toContain('request cap');
  });

  it('refuses to run a turn in a paused room', async () => {
    const root = makeWorkspaceRoot();
    const { room } = setupPricingRoom(root);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const paused = loadRoom(root, room.id)!;
    paused.status = 'paused';
    const { saveRoom } = await import('../storage.ts');
    saveRoom(root, paused);

    const runner: AgentRunner = () => ({ actions: [] });

    expect(runAgentTurn(root, { roomId: room.id, agentId: frontend.id, runner })).rejects.toThrow('paused');
  });
});

describe('runRoomScheduler (blueprint 11.9 vertical slice)', () => {
  it('drives the ask/answer loop between agents until the room is quiescent', async () => {
    const root = makeWorkspaceRoot();
    const { room } = setupPricingRoom(root);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;

    // scripted Frontend: missing api-contract -> ask Backend; after the answer arrives -> done
    const frontendRunner: AgentRunner = (input) => {
      const hasApiContract = input.contextPack.requiredArtifacts.some(
        (artifact) => artifact.type === 'api_contract'
      );
      const answered = input.contextPack.attentionEvents.some(
        (event) => event.type === 'answer_agent'
      );
      if (!hasApiContract && !answered) {
        return {
          actions: [
            {
              type: 'ask_agent',
              to: [{ type: 'agent', id: backend.id }],
              payload: {
                message: 'Missing pricing API contract, cannot implement API integration.',
                expectedOutput: 'API contract including monthly/yearly price fields',
              },
            },
          ],
        };
      }
      return { actions: [] };
    };

    // scripted Backend: answer any open ask_agent addressed to it
    const backendRunner: AgentRunner = (input) => {
      const openAsk = input.contextPack.attentionEvents.find(
        (event) => event.type === 'ask_agent' && event.status === 'open'
      );
      if (openAsk) {
        return {
          actions: [
            {
              type: 'answer_agent',
              to: [{ type: 'agent', id: openAsk.from }],
              parentEventId: openAsk.id,
              payload: { message: 'api-contract v2 published with yearlyPrice.' },
            },
          ],
        };
      }
      return { actions: [] };
    };

    publishRoomBusEvent(root, {
      roomId: room.id,
      from: 'user',
      type: 'message',
      payload: { message: '@Frontend implement the pricing page.' },
    });

    const result = await runRoomScheduler(root, {
      roomId: room.id,
      runners: {
        [frontend.id]: frontendRunner,
        [backend.id]: backendRunner,
      },
    });

    expect(result.stoppedReason).toBe('quiescent');
    // frontend asked -> backend answered -> frontend consumed the answer
    expect(result.turns.map((turn) => turn.agentId)).toEqual([frontend.id, backend.id, frontend.id]);

    const reloaded = loadRoom(root, room.id)!;
    const ask = reloaded.events.find((event) => event.type === 'ask_agent')!;
    expect(ask.status).toBe('resolved');
    expect(reloaded.events.some((event) => event.type === 'answer_agent')).toBe(true);

    // quiescent means no unread inbox items remain anywhere
    const unread = reloaded.inboxes.flatMap((inbox) => inbox.items).filter((item) => item.status === 'unread');
    expect(unread).toHaveLength(0);
  });

  it('stops at the turn cap when scripted agents ping-pong forever', async () => {
    const root = makeWorkspaceRoot();
    const { room } = setupPricingRoom(root);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;

    let n = 0;
    const alwaysAsk = (target: string): AgentRunner => () => ({
      actions: [
        {
          type: 'ask_agent',
          to: [{ type: 'agent', id: target }],
          // fresh payload every time so bus-level loop detection cannot catch it
          payload: { message: `question ${n++}`, expectedOutput: 'an answer' },
        },
      ],
    });

    publishRoomBusEvent(root, {
      roomId: room.id,
      from: 'user',
      type: 'message',
      payload: { message: '@Frontend start.' },
    });

    const result = await runRoomScheduler(root, {
      roomId: room.id,
      runners: {
        [frontend.id]: alwaysAsk(backend.id),
        [backend.id]: alwaysAsk(frontend.id),
      },
      maxTurns: 6,
    });

    expect(result.stoppedReason).toBe('max_turns');
    expect(result.turns).toHaveLength(6);
  });

  it('does not run any turns in a paused room', async () => {
    const root = makeWorkspaceRoot();
    const { room } = setupPricingRoom(root);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;

    publishRoomBusEvent(root, {
      roomId: room.id,
      from: 'user',
      type: 'message',
      payload: { message: '@Frontend start.' },
    });

    const paused = loadRoom(root, room.id)!;
    paused.status = 'paused';
    const { saveRoom } = await import('../storage.ts');
    saveRoom(root, paused);

    const result = await runRoomScheduler(root, {
      roomId: room.id,
      runners: { [frontend.id]: () => ({ actions: [] }) },
    });

    expect(result.stoppedReason).toBe('room_paused');
    expect(result.turns).toHaveLength(0);
  });
});

describe('createLlmAgentRunner', () => {
  it('sends role prompt + context to queryLlm with an action schema and publishes parsed actions', async () => {
    const root = makeWorkspaceRoot();
    const { room } = setupPricingRoom(root);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;

    publishRoomBusEvent(root, {
      roomId: room.id,
      from: 'user',
      type: 'message',
      payload: { message: '@Frontend implement the pricing page.' },
    });

    const captured: Array<Record<string, unknown>> = [];
    const fakeQueryLlm = async (request: {
      prompt: string;
      systemPrompt?: string;
      outputSchema?: Record<string, unknown>;
      model?: string;
    }) => {
      captured.push(request);
      return {
        text: JSON.stringify({
          actions: [
            {
              type: 'ask_agent',
              to: [{ type: 'agent', id: backend.id }],
              payload: {
                message: 'Please provide the pricing API contract.',
                expectedOutput: 'API contract artifact',
              },
            },
          ],
        }),
      };
    };

    const runner = createLlmAgentRunner({ queryLlm: fakeQueryLlm, model: 'claude-fable-5' });
    const result = await runAgentTurn(root, { roomId: room.id, agentId: frontend.id, runner });

    // the LLM was called with the role prompt as system prompt and the room context as prompt
    expect(captured).toHaveLength(1);
    expect(String(captured[0]!.systemPrompt)).toContain('You are the Frontend Agent.');
    expect(String(captured[0]!.prompt)).toContain('Room Members');
    expect(captured[0]!.model).toBe('claude-fable-5');

    // the action schema restricts types to the role's allowed actions
    const schema = JSON.stringify(captured[0]!.outputSchema);
    expect(schema).toContain('ask_agent');
    expect(schema).not.toContain('"decision"');

    // the parsed action went through the normal turn pipeline
    expect(result.publishedEvents).toHaveLength(1);
    expect(result.publishedEvents[0]!.type).toBe('ask_agent');
  });

  it('yields no actions when the LLM returns malformed output', async () => {
    const root = makeWorkspaceRoot();
    const { room } = setupPricingRoom(root);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;

    const runner = createLlmAgentRunner({
      queryLlm: async () => ({ text: 'sorry, I cannot produce JSON today' }),
    });
    const result = await runAgentTurn(root, { roomId: room.id, agentId: frontend.id, runner });

    expect(result.publishedEvents).toHaveLength(0);
    expect(result.rejectedActions).toHaveLength(0);
  });
});

describe('turn logs (Context Used persistence)', () => {
  it('persists a turn log with contextUsed and published event ids', async () => {
    const root = makeWorkspaceRoot();
    const { room } = setupPricingRoom(root);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;

    publishRoomBusEvent(root, {
      roomId: room.id,
      from: 'user',
      type: 'message',
      payload: { message: '@Frontend implement the pricing page.' },
    });

    const runner: AgentRunner = () => ({
      actions: [
        {
          type: 'ask_agent',
          to: [{ type: 'agent', id: backend.id }],
          payload: { message: 'Need the API contract.', expectedOutput: 'API contract' },
        },
      ],
    });

    const result = await runAgentTurn(root, { roomId: room.id, agentId: frontend.id, runner });

    const reloaded = loadRoom(root, room.id)!;
    expect(reloaded.turnLogs).toBeDefined();
    expect(reloaded.turnLogs!).toHaveLength(1);

    const log = reloaded.turnLogs![0]!;
    expect(log.agentId).toBe(frontend.id);
    expect(log.publishedEventIds).toEqual(result.publishedEvents.map((event) => event.id));
    // context used mirrors what the agent actually read this turn
    expect(log.contextUsed.some((item) => item.type === 'role')).toBe(true);
    expect(log.contextUsed.some((item) => item.label === 'design-tokens.json@v3')).toBe(true);
  });
});

describe('createLlmAgentRunner output parsing', () => {
  it('parses actions wrapped in markdown code fences', async () => {
    const root = makeWorkspaceRoot();
    const { room } = setupPricingRoom(root);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;

    const fencedText = [
      'Here is my plan:',
      '```json',
      JSON.stringify({
        actions: [
          {
            type: 'ask_agent',
            to: [{ type: 'agent', id: backend.id }],
            payload: { message: 'Need the contract.', expectedOutput: 'API contract' },
          },
        ],
      }),
      '```',
    ].join('\n');

    const runner = createLlmAgentRunner({ queryLlm: async () => ({ text: fencedText }) });
    const result = await runAgentTurn(root, { roomId: room.id, agentId: frontend.id, runner });

    expect(result.publishedEvents).toHaveLength(1);
    expect(result.publishedEvents[0]!.type).toBe('ask_agent');
  });
});

describe('createLlmAgentRunner action normalization', () => {
  it('normalizes loose model output: action/type alias, string target, top-level message', async () => {
    const root = makeWorkspaceRoot();
    const { room } = setupPricingRoom(root);
    const frontend = room.members.find((member) => member.roleKey === 'frontend')!;
    const backend = room.members.find((member) => member.roleKey === 'backend')!;

    const looseText = JSON.stringify({
      actions: [
        {
          action: 'ask_agent',
          to: 'backend',
          message: 'Please provide the pricing API contract.',
        },
      ],
    });

    const runner = createLlmAgentRunner({ queryLlm: async () => ({ text: looseText }) });
    const result = await runAgentTurn(root, { roomId: room.id, agentId: frontend.id, runner });

    expect(result.rejectedActions).toHaveLength(0);
    expect(result.publishedEvents).toHaveLength(1);
    const event = result.publishedEvents[0]!;
    expect(event.type).toBe('ask_agent');
    // string target resolved to the backend member
    expect(event.to).toEqual([{ type: 'agent', id: backend.id }]);
    // top-level message folded into payload; missing expectedOutput defaulted
    expect(event.payload.message).toBe('Please provide the pricing API contract.');
    expect(typeof event.payload.expectedOutput).toBe('string');
  });
});
