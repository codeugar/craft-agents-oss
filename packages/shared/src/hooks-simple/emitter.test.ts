/**
 * HookEmitter Tests
 *
 * Tests for the session metadata diffing and hook emission delegation.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { tmpdir } from 'os';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';

import { HookEmitter, type SessionMetadataSnapshot } from './emitter.ts';
import { clearHooks, type HooksConfig } from './index.ts';

describe('HookEmitter', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `hook-emitter-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    clearHooks();
  });

  afterEach(() => {
    clearHooks();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  describe('diffSessionMetadata', () => {
    test('returns empty array when no changes', () => {
      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });

      const prev: SessionMetadataSnapshot = {
        permissionMode: 'explore',
        labels: ['bug'],
        isFlagged: false,
        todoState: 'todo',
      };

      const next: SessionMetadataSnapshot = {
        permissionMode: 'explore',
        labels: ['bug'],
        isFlagged: false,
        todoState: 'todo',
      };

      const changes = emitter.diffSessionMetadata(prev, next, 'session-1');
      expect(changes).toHaveLength(0);
    });

    test('detects permission mode change', () => {
      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });

      const prev: SessionMetadataSnapshot = { permissionMode: 'explore' };
      const next: SessionMetadataSnapshot = { permissionMode: 'execute' };

      const changes = emitter.diffSessionMetadata(prev, next, 'session-1');

      expect(changes).toHaveLength(1);
      expect(changes[0].event).toBe('PermissionModeChange');
      expect(changes[0].payload).toEqual({
        sessionId: 'session-1',
        oldMode: 'explore',
        newMode: 'execute',
      });
    });

    test('detects label added', () => {
      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });

      const prev: SessionMetadataSnapshot = { labels: ['bug'] };
      const next: SessionMetadataSnapshot = { labels: ['bug', 'urgent'] };

      const changes = emitter.diffSessionMetadata(prev, next, 'session-1');

      expect(changes).toHaveLength(1);
      expect(changes[0].event).toBe('LabelAdd');
      expect(changes[0].payload).toEqual({
        sessionId: 'session-1',
        label: 'urgent',
      });
    });

    test('detects label removed', () => {
      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });

      const prev: SessionMetadataSnapshot = { labels: ['bug', 'urgent'] };
      const next: SessionMetadataSnapshot = { labels: ['bug'] };

      const changes = emitter.diffSessionMetadata(prev, next, 'session-1');

      expect(changes).toHaveLength(1);
      expect(changes[0].event).toBe('LabelRemove');
      expect(changes[0].payload).toEqual({
        sessionId: 'session-1',
        label: 'urgent',
      });
    });

    test('detects multiple label changes', () => {
      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });

      const prev: SessionMetadataSnapshot = { labels: ['bug', 'old'] };
      const next: SessionMetadataSnapshot = { labels: ['bug', 'new'] };

      const changes = emitter.diffSessionMetadata(prev, next, 'session-1');

      expect(changes).toHaveLength(2);

      const addEvent = changes.find((c) => c.event === 'LabelAdd');
      const removeEvent = changes.find((c) => c.event === 'LabelRemove');

      expect(addEvent?.payload.label).toBe('new');
      expect(removeEvent?.payload.label).toBe('old');
    });

    test('detects flag change to true', () => {
      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });

      const prev: SessionMetadataSnapshot = { isFlagged: false };
      const next: SessionMetadataSnapshot = { isFlagged: true };

      const changes = emitter.diffSessionMetadata(prev, next, 'session-1');

      expect(changes).toHaveLength(1);
      expect(changes[0].event).toBe('FlagChange');
      expect(changes[0].payload).toEqual({
        sessionId: 'session-1',
        isFlagged: true,
      });
    });

    test('detects flag change to false', () => {
      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });

      const prev: SessionMetadataSnapshot = { isFlagged: true };
      const next: SessionMetadataSnapshot = { isFlagged: false };

      const changes = emitter.diffSessionMetadata(prev, next, 'session-1');

      expect(changes).toHaveLength(1);
      expect(changes[0].event).toBe('FlagChange');
      expect(changes[0].payload).toEqual({
        sessionId: 'session-1',
        isFlagged: false,
      });
    });

    test('detects todo state change', () => {
      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });

      const prev: SessionMetadataSnapshot = { todoState: 'todo' };
      const next: SessionMetadataSnapshot = { todoState: 'done' };

      const changes = emitter.diffSessionMetadata(prev, next, 'session-1');

      expect(changes).toHaveLength(1);
      expect(changes[0].event).toBe('TodoStateChange');
      expect(changes[0].payload).toEqual({
        sessionId: 'session-1',
        oldState: 'todo',
        newState: 'done',
      });
    });

    test('handles undefined values gracefully', () => {
      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });

      const prev: SessionMetadataSnapshot = {};
      const next: SessionMetadataSnapshot = {
        permissionMode: 'execute',
        labels: ['bug'],
        isFlagged: true,
        todoState: 'in-progress',
      };

      const changes = emitter.diffSessionMetadata(prev, next, 'session-1');

      expect(changes).toHaveLength(4);

      const events = changes.map((c) => c.event);
      expect(events).toContain('PermissionModeChange');
      expect(events).toContain('LabelAdd');
      expect(events).toContain('FlagChange');
      expect(events).toContain('TodoStateChange');
    });

    test('detects multiple changes at once', () => {
      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });

      const prev: SessionMetadataSnapshot = {
        permissionMode: 'explore',
        labels: ['bug'],
        isFlagged: false,
        todoState: 'todo',
      };

      const next: SessionMetadataSnapshot = {
        permissionMode: 'execute',
        labels: ['feature'],
        isFlagged: true,
        todoState: 'done',
      };

      const changes = emitter.diffSessionMetadata(prev, next, 'session-1');

      // PermissionModeChange + LabelAdd + LabelRemove + FlagChange + TodoStateChange = 5
      expect(changes).toHaveLength(5);
    });
  });

  describe('initialize', () => {
    test('initializes without hooks.json', async () => {
      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });

      const result = await emitter.initialize();

      expect(result.success).toBe(true);
      expect(result.hookCount).toBe(0);
      expect(emitter.isInitialized()).toBe(true);
    });

    test('initializes with hooks.json', async () => {
      const config: HooksConfig = {
        hooks: {
          LabelAdd: [{ hooks: [{ type: 'command', command: 'echo test' }] }],
        },
      };
      writeFileSync(join(testDir, 'hooks.json'), JSON.stringify(config));

      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });

      const result = await emitter.initialize();

      expect(result.success).toBe(true);
      expect(result.hookCount).toBe(1);
    });

    test('only initializes once', async () => {
      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });

      await emitter.initialize();
      const result = await emitter.initialize();

      expect(result.success).toBe(true);
      expect(result.hookCount).toBe(0); // Returns 0 on subsequent calls
    });
  });

  describe('emitAll', () => {
    test('emits hooks with execution results', async () => {
      const config: HooksConfig = {
        hooks: {
          LabelAdd: [{ hooks: [{ type: 'command', command: 'echo "label added"' }] }],
        },
      };
      writeFileSync(join(testDir, 'hooks.json'), JSON.stringify(config));

      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });
      await emitter.initialize();

      const results = await emitter.emitAll([
        { event: 'LabelAdd', payload: { sessionId: 'session-1', label: 'bug' } },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].event).toBe('LabelAdd');
      expect(results[0].result.matched).toBe(1);
      expect(results[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    test('calls onEmit callback', async () => {
      const emittedEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];

      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
        onEmit: (event, payload) => emittedEvents.push({ event, payload }),
      });
      await emitter.initialize();

      await emitter.emitAll([
        { event: 'LabelAdd', payload: { sessionId: 'session-1', label: 'bug' } },
      ]);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].event).toBe('LabelAdd');
    });

    test('handles errors gracefully', async () => {
      const errors: Array<{ event: string; error: Error }> = [];

      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
        onError: (event, error) => errors.push({ event, error }),
      });
      await emitter.initialize();

      // Even with a bad command, emitAll should not throw
      const config: HooksConfig = {
        hooks: {
          LabelAdd: [{ hooks: [{ type: 'command', command: 'nonexistent_command_12345' }] }],
        },
      };
      writeFileSync(join(testDir, 'hooks.json'), JSON.stringify(config));

      // Re-initialize to pick up new config
      clearHooks();
      const newEmitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
        onError: (event, error) => errors.push({ event, error }),
      });
      await newEmitter.initialize();

      const results = await newEmitter.emitAll([
        { event: 'LabelAdd', payload: { sessionId: 'session-1', label: 'bug' } },
      ]);

      // Should still get a result, just with success: false
      expect(results).toHaveLength(1);
      expect(results[0].result.matched).toBe(1);
      // The command should fail but not throw
      expect(results[0].result.results[0].success).toBe(false);
    });
  });

  describe('diffAndEmit', () => {
    test('combines diff and emit', async () => {
      const config: HooksConfig = {
        hooks: {
          FlagChange: [{ hooks: [{ type: 'command', command: 'echo "flagged"' }] }],
        },
      };
      writeFileSync(join(testDir, 'hooks.json'), JSON.stringify(config));

      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });
      await emitter.initialize();

      const prev: SessionMetadataSnapshot = { isFlagged: false };
      const next: SessionMetadataSnapshot = { isFlagged: true };

      const results = await emitter.diffAndEmit(prev, next, 'session-1');

      expect(results).toHaveLength(1);
      expect(results[0].event).toBe('FlagChange');
      expect(results[0].result.matched).toBe(1);
    });

    test('returns empty array when no changes', async () => {
      const emitter = new HookEmitter({
        workspaceRootPath: testDir,
        workspaceId: 'test-ws',
      });
      await emitter.initialize();

      const prev: SessionMetadataSnapshot = { isFlagged: false };
      const next: SessionMetadataSnapshot = { isFlagged: false };

      const results = await emitter.diffAndEmit(prev, next, 'session-1');

      expect(results).toHaveLength(0);
    });
  });
});
