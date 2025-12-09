import { trace, type Span, SpanKind, SpanStatusCode, context } from '@opentelemetry/api';
import type { AgentEvent } from '../agent/craft-agent.ts';
import type { PiiRedactor } from './pii-redactor.ts';
import { debug } from '../tui/utils/debug.ts';

const TRACER_NAME = 'craft-terminal-agent';

/**
 * Metadata for starting a conversation turn
 */
export interface ConversationTurnMetadata {
  sessionId: string | null;
  workspaceId: string;
  model: string;
  hasAttachments: boolean;
  attachmentCount: number;
}

/**
 * Result of a conversation turn
 */
export interface ConversationTurnResult {
  success: boolean;
  reason?: string;
}

/**
 * Instrumentation for the Craft Agent
 *
 * Creates spans for:
 * - Conversation turns (root span per chat() call)
 * - Tool executions (child spans)
 * - LLM calls (implicit via SDK events)
 */
export class TraceInstrumentation {
  private tracer = trace.getTracer(TRACER_NAME);
  private redactor: PiiRedactor;

  // Active spans for correlation
  private conversationSpan: Span | null = null;
  private toolSpans: Map<string, Span> = new Map();

  // Metrics accumulator
  private currentTurnMetrics = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0,
    toolCount: 0,
    startTime: 0,
  };

  constructor(redactor: PiiRedactor) {
    this.redactor = redactor;
  }

  // start new conversation turn span. Called at beginning of chat()
  startConversationTurn(metadata: ConversationTurnMetadata): void {
    // end any existing conversation span
    if (this.conversationSpan) {
      this.endConversationTurn({ success: false, reason: 'interrupted' });
    }

    this.currentTurnMetrics = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
      toolCount: 0,
      startTime: Date.now(),
    };

    this.conversationSpan = this.tracer.startSpan('conversation.turn', {
      kind: SpanKind.CLIENT,
      attributes: {
        // we still need correlation - hash the IDs
        session_id: metadata.sessionId ? this.redactor.hash(metadata.sessionId) : 'none',
        workspace_id: this.redactor.hash(metadata.workspaceId),

        // safe metadata
        model: metadata.model,
        has_attachments: metadata.hasAttachments,
        attachment_count: metadata.attachmentCount,
      },
    });

    debug('[Tracing] Started conversation turn span');
  }

  processEvent(event: AgentEvent): void {
    if (!this.conversationSpan) return;

    switch (event.type) {
      case 'tool_start':
        this.startToolSpan(event);
        break;

      case 'tool_result':
        this.endToolSpan(event);
        break;

      case 'complete':
        if (event.usage) {
          this.currentTurnMetrics.inputTokens += event.usage.inputTokens;
          this.currentTurnMetrics.outputTokens += event.usage.outputTokens;
          this.currentTurnMetrics.cacheReadTokens += event.usage.cacheReadTokens || 0;
          this.currentTurnMetrics.cacheCreationTokens += event.usage.cacheCreationTokens || 0;
          this.currentTurnMetrics.costUsd += event.usage.costUsd || 0;
        }
        break;

      case 'error':
        this.conversationSpan.setStatus({
          code: SpanStatusCode.ERROR,
        });
        this.conversationSpan.setAttribute('error_occurred', true);
        break;
    }
  }

  // tool execution span
  private startToolSpan(event: { toolName: string; toolUseId: string; input: Record<string, unknown> }): void {
    if (!this.conversationSpan) return;

    const ctx = trace.setSpan(context.active(), this.conversationSpan);

    const span = this.tracer.startSpan(
      `tool.${event.toolName}`,
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          tool_name: event.toolName,
          tool_use_id: this.redactor.hash(event.toolUseId),
          // note: tool input not included here
        },
      },
      ctx
    );

    this.toolSpans.set(event.toolUseId, span);
    this.currentTurnMetrics.toolCount++;

    debug(`[Tracing] Started tool span: ${event.toolName}`);
  }

  private endToolSpan(event: { toolUseId: string; isError: boolean }): void {
    const span = this.toolSpans.get(event.toolUseId);
    if (!span) return;

    span.setAttribute('success', !event.isError);

    if (event.isError) {
      span.setStatus({ code: SpanStatusCode.ERROR });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    // note: tool result not included here

    span.end();
    this.toolSpans.delete(event.toolUseId);

    debug(`[Tracing] Ended tool span: ${event.toolUseId}`);
  }

  endConversationTurn(result: ConversationTurnResult): void {
    if (!this.conversationSpan) return;

    const duration = Date.now() - this.currentTurnMetrics.startTime;

    // final metrics
    this.conversationSpan.setAttributes({
      input_tokens: this.currentTurnMetrics.inputTokens,
      output_tokens: this.currentTurnMetrics.outputTokens,
      cache_read_tokens: this.currentTurnMetrics.cacheReadTokens,
      cache_creation_tokens: this.currentTurnMetrics.cacheCreationTokens,
      total_tokens: this.currentTurnMetrics.inputTokens + this.currentTurnMetrics.outputTokens,
      cost_usd: this.currentTurnMetrics.costUsd,

      duration_ms: duration,
      tool_count: this.currentTurnMetrics.toolCount,

      success: result.success,
    });

    if (result.success) {
      this.conversationSpan.setStatus({ code: SpanStatusCode.OK });
    } else {
      this.conversationSpan.setStatus({ code: SpanStatusCode.ERROR });
      if (result.reason) {
        this.conversationSpan.setAttribute('failure_reason', result.reason);
      }
    }

    this.conversationSpan.end();
    this.conversationSpan = null;

    // end orphaned tool spans
    for (const [id, span] of this.toolSpans) {
      debug(`[Tracing] Ending orphaned tool span: ${id}`);
      span.setStatus({ code: SpanStatusCode.ERROR });
      span.setAttribute('orphaned', true);
      span.end();
    }
    this.toolSpans.clear();

    debug('[Tracing] Ended conversation turn span');
  }

  isActive(): boolean {
    return this.conversationSpan !== null;
  }
}
