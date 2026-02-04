/**
 * HookEventLogger - Logs hook events to events.jsonl
 *
 * CloudEvents-inspired schema with batched I/O for performance.
 * Append-only design for audit trail and replay capabilities.
 */

import { appendFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { HookExecutionResult } from './index.ts';

// ============================================================================
// Types
// ============================================================================

export interface LoggedHookEvent {
  /** Unique event ID (UUID) */
  id: string;
  /** Event type (e.g., 'LabelAdd', 'PermissionModeChange') */
  type: string;
  /** ISO 8601 UTC timestamp */
  time: string;
  /** Origin identifier */
  source: string;
  /** Session context (if applicable) */
  sessionId?: string;
  /** Workspace context */
  workspaceId?: string;
  /** Event payload */
  data: Record<string, unknown>;
  /** Hook execution results */
  results: HookExecutionResult[];
  /** Total execution time in milliseconds */
  durationMs: number;
}

export type LoggedHookEventInput = Omit<LoggedHookEvent, 'id' | 'time' | 'source'>;

// ============================================================================
// HookEventLogger Class
// ============================================================================

export class HookEventLogger {
  private logPath: string;
  private buffer: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly FLUSH_DELAY_MS = 100;

  constructor(workspaceRootPath: string) {
    this.logPath = join(workspaceRootPath, 'events.jsonl');
  }

  /**
   * Log an event to the event stream.
   * Events are buffered and flushed after a short delay to coalesce rapid writes.
   */
  log(event: LoggedHookEventInput): void {
    const entry: LoggedHookEvent = {
      id: randomUUID(),
      time: new Date().toISOString(),
      source: 'craft-agent/hooks',
      ...event,
    };
    this.buffer.push(JSON.stringify(entry));
    this.scheduleFlush();
  }

  /**
   * Get the path to the event log file.
   */
  getLogPath(): string {
    return this.logPath;
  }

  /**
   * Schedule a flush if not already scheduled.
   */
  private scheduleFlush(): void {
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.FLUSH_DELAY_MS);
    }
  }

  /**
   * Flush buffered events to disk.
   */
  private async flush(): Promise<void> {
    this.flushTimer = null;
    if (this.buffer.length === 0) return;

    const lines = this.buffer.splice(0).join('\n') + '\n';
    try {
      await appendFile(this.logPath, lines, 'utf-8');
    } catch (error) {
      console.error('[HookEventLogger] Write failed:', error);
    }
  }

  /**
   * Close the logger, flushing any remaining events.
   * Call this during application shutdown.
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}
