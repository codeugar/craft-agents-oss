/**
 * Event Adapter (App-Server v2 Protocol)
 *
 * Maps Codex app-server v2 notifications to Craft Agent's AgentEvent format.
 * This enables the CodexBackend to emit events compatible with the existing UI.
 *
 * The v2 protocol uses ServerNotification types with structured item/turn events,
 * which provide more granular control than the previous ThreadEvent format.
 */

import type { AgentEvent, AgentEventUsage } from '@craft-agent/core/types';

// Import v2 types from generated codex-types
import type {
  ThreadItem,
  ItemStartedNotification,
  ItemCompletedNotification,
  AgentMessageDeltaNotification,
  TurnStartedNotification,
  TurnCompletedNotification,
  ThreadStartedNotification,
  FileUpdateChange,
} from '@craft-agent/codex-types/v2';

// Simplified notification types for delta events
interface OutputDeltaNotification {
  threadId: string;
  turnId: string;
  itemId: string;
  delta: string;
}

/**
 * Maps Codex app-server v2 events to AgentEvents for UI compatibility.
 *
 * Event mapping:
 * - thread/started → (internal, thread ID captured in backend)
 * - turn/started → status event
 * - item/started → tool_start (for tool items)
 * - item/agentMessage/delta → text_delta
 * - item/reasoning/textDelta → thinking_delta
 * - item/commandExecution/outputDelta → (streaming output, captured for tool_result)
 * - item/completed → tool_result / text_complete
 * - turn/completed → complete with usage
 */
export class EventAdapter {
  private turnIndex: number = 0;
  private itemIndex: number = 0;

  // Track accumulated text per item for streaming deltas
  private accumulatedText: Map<string, string> = new Map();

  // Track command output for tool results
  private commandOutput: Map<string, string> = new Map();

  /**
   * Start a new turn - resets item indexing and streaming state.
   */
  startTurn(): void {
    this.turnIndex++;
    this.itemIndex = 0;
    this.accumulatedText.clear();
    this.commandOutput.clear();
  }

  /**
   * Adapt thread/started notification.
   */
  *adaptThreadStarted(notification: ThreadStartedNotification): Generator<AgentEvent> {
    // Internal event - no UI event emitted, thread ID captured in backend
  }

  /**
   * Adapt turn/started notification.
   */
  *adaptTurnStarted(notification: TurnStartedNotification): Generator<AgentEvent> {
    yield { type: 'status', message: 'Thinking...' };
  }

  /**
   * Adapt turn/completed notification.
   */
  *adaptTurnCompleted(_notification: TurnCompletedNotification): Generator<AgentEvent> {
    // Turn completed - emit complete event
    // Note: Usage tracking is handled by the backend separately
    yield { type: 'complete' };
  }

  /**
   * Adapt item/started notification.
   */
  *adaptItemStarted(notification: ItemStartedNotification): Generator<AgentEvent> {
    this.itemIndex++;
    const item = notification.item;

    switch (item.type) {
      case 'commandExecution':
        yield this.createToolStart(item.id, 'Bash', {
          command: item.command,
          cwd: item.cwd,
        });
        break;

      case 'fileChange':
        yield this.createToolStart(item.id, 'Edit', {
          changes: item.changes,
        });
        break;

      case 'mcpToolCall':
        yield this.createToolStart(
          item.id,
          `mcp__${item.server}__${item.tool}`,
          item.arguments as Record<string, unknown>,
        );
        break;

      case 'webSearch':
        yield this.createToolStart(item.id, 'WebSearch', {
          query: item.query,
        });
        break;

      // No start event for messages, reasoning, errors
      default:
        break;
    }
  }

  /**
   * Adapt item/agentMessage/delta notification - streaming text.
   */
  *adaptAgentMessageDelta(notification: AgentMessageDeltaNotification): Generator<AgentEvent> {
    const delta = notification.delta;
    if (delta) {
      yield {
        type: 'text_delta',
        text: delta,
      };
    }
  }

  /**
   * Adapt item/reasoning/textDelta notification - streaming thinking.
   * Note: Reasoning deltas are ignored for now as there's no thinking_delta AgentEvent type.
   * The full reasoning content is captured in item/completed.
   */
  *adaptReasoningDelta(_notification: OutputDeltaNotification): Generator<AgentEvent> {
    // Reasoning deltas are accumulated but not streamed to UI
    // The full content is emitted in adaptItemCompleted for reasoning items
  }

  /**
   * Adapt item/commandExecution/outputDelta - accumulate for tool result.
   */
  adaptCommandOutputDelta(notification: OutputDeltaNotification): void {
    const { itemId, delta } = notification;
    const current = this.commandOutput.get(itemId) || '';
    this.commandOutput.set(itemId, current + delta);
  }

  /**
   * Adapt item/completed notification.
   */
  *adaptItemCompleted(notification: ItemCompletedNotification): Generator<AgentEvent> {
    const item = notification.item;

    switch (item.type) {
      case 'commandExecution':
        yield this.createCommandResult(item);
        break;

      case 'fileChange':
        yield this.createFileChangeResult(item);
        break;

      case 'mcpToolCall':
        yield this.createMcpResult(item);
        break;

      case 'agentMessage':
        yield this.createTextCompleteEvent(item);
        break;

      case 'reasoning':
        // Reasoning is emitted as intermediate text_complete
        yield this.createReasoningEvent(item);
        break;

      case 'webSearch':
        yield {
          type: 'tool_result',
          toolUseId: item.id,
          toolName: 'WebSearch',
          result: `Search completed: ${item.query}`,
          isError: false,
        };
        break;

      default:
        break;
    }
  }

  /**
   * Create a tool_start event.
   */
  private createToolStart(
    id: string,
    toolName: string,
    input: Record<string, unknown>,
  ): AgentEvent {
    return {
      type: 'tool_start',
      toolName,
      toolUseId: id,
      input,
    };
  }

  /**
   * Create tool result for command execution.
   */
  private createCommandResult(item: ThreadItem & { type: 'commandExecution' }): AgentEvent {
    const isError =
      item.status === 'failed' || (item.exitCode !== undefined && item.exitCode !== 0);

    // Use accumulated output from deltas, or fallback to item output
    const output = this.commandOutput.get(item.id) || item.aggregatedOutput || '';

    return {
      type: 'tool_result',
      toolUseId: item.id,
      toolName: 'Bash',
      result: output || (isError ? `Exit code: ${item.exitCode}` : 'Success'),
      isError,
    };
  }

  /**
   * Create tool result for file changes.
   */
  private createFileChangeResult(item: ThreadItem & { type: 'fileChange' }): AgentEvent {
    const isError = item.status === 'failed';
    const summary = item.changes.map((c: FileUpdateChange) => `${c.kind}: ${c.path}`).join('\n');

    return {
      type: 'tool_result',
      toolUseId: item.id,
      toolName: 'Edit',
      result: isError ? `Patch failed:\n${summary}` : `Applied:\n${summary}`,
      isError,
    };
  }

  /**
   * Create tool result for MCP tool calls.
   */
  private createMcpResult(item: ThreadItem & { type: 'mcpToolCall' }): AgentEvent {
    const isError = item.status === 'failed' || item.error !== undefined;
    let result: string;

    if (item.error) {
      result = item.error.message;
    } else if (item.result) {
      // Extract text from MCP result
      // The v2 McpToolCallResult has a different structure
      result = typeof item.result === 'string' ? item.result : JSON.stringify(item.result);
    } else {
      result = 'Success';
    }

    return {
      type: 'tool_result',
      toolUseId: item.id,
      toolName: `mcp__${item.server}__${item.tool}`,
      result,
      isError,
    };
  }

  /**
   * Create text_complete event for agent message.
   */
  private createTextCompleteEvent(item: ThreadItem & { type: 'agentMessage' }): AgentEvent {
    return {
      type: 'text_complete',
      text: item.text,
    };
  }

  /**
   * Create text_complete event for reasoning (marked as intermediate).
   */
  private createReasoningEvent(item: ThreadItem & { type: 'reasoning' }): AgentEvent {
    // v2 reasoning has summary array instead of single text
    const text = item.summary?.join('\n') || item.content?.join('\n') || '';
    return {
      type: 'text_complete',
      text,
      isIntermediate: true,
    };
  }
}
