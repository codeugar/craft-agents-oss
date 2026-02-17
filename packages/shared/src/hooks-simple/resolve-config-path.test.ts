import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveTasksConfigPath, migrateHooksToTasks } from './resolve-config-path.ts';

describe('resolve-config-path', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'resolve-tasks-config-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('prefers tasks.json when valid and non-empty', () => {
    writeFileSync(join(tempDir, 'tasks.json'), JSON.stringify({
      version: 2,
      tasks: { LabelAdd: [{ actions: [{ type: 'command', command: 'echo ok' }] }] },
    }));
    writeFileSync(join(tempDir, 'hooks.json'), JSON.stringify({
      hooks: { LabelAdd: [{ hooks: [{ type: 'command', command: 'echo legacy' }] }] },
    }));

    expect(resolveTasksConfigPath(tempDir)).toBe(join(tempDir, 'tasks.json'));
  });

  it('falls back to hooks.json when both exist and tasks.json is invalid', () => {
    writeFileSync(join(tempDir, 'tasks.json'), '{ invalid json');
    writeFileSync(join(tempDir, 'hooks.json'), JSON.stringify({
      hooks: { LabelAdd: [{ hooks: [{ type: 'command', command: 'echo legacy' }] }] },
    }));

    expect(resolveTasksConfigPath(tempDir)).toBe(join(tempDir, 'hooks.json'));
  });

  it('keeps tasks.json canonical when hooks.json does not exist', () => {
    writeFileSync(join(tempDir, 'tasks.json'), '{ invalid json');
    expect(resolveTasksConfigPath(tempDir)).toBe(join(tempDir, 'tasks.json'));
  });

  it('migrates hooks.json to tasks.json and preserves matcher ids', () => {
    writeFileSync(join(tempDir, 'hooks.json'), JSON.stringify({
      version: 1,
      hooks: {
        LabelAdd: [
          { id: 'abc123', hooks: [{ type: 'command', command: 'echo 1' }] },
          { hooks: [{ type: 'command', command: 'echo 2' }] },
        ],
      },
    }));

    const migrated = migrateHooksToTasks(tempDir);
    expect(migrated).toBe(true);

    const tasksPath = join(tempDir, 'tasks.json');
    const config = JSON.parse(readFileSync(tasksPath, 'utf-8'));
    const first = config.tasks.LabelAdd[0];
    const second = config.tasks.LabelAdd[1];

    expect(first.id).toBe('abc123');
    expect(typeof second.id).toBe('string');
    expect(second.id.length).toBe(6);
    expect(existsSync(join(tempDir, 'hooks.json'))).toBe(false);
    expect(
      readdirSync(tempDir).some((name) => name === 'hooks.json.old' || name.startsWith('hooks.json.old.'))
    ).toBe(true);
  });

  it('re-migrates from hooks.json when tasks.json is empty and both files exist', () => {
    writeFileSync(join(tempDir, 'tasks.json'), JSON.stringify({ version: 2, tasks: {} }));
    writeFileSync(join(tempDir, 'hooks.json'), JSON.stringify({
      hooks: {
        LabelAdd: [{ hooks: [{ type: 'command', command: 'echo from hooks' }] }],
      },
    }));

    const migrated = migrateHooksToTasks(tempDir);
    expect(migrated).toBe(true);

    const config = JSON.parse(readFileSync(join(tempDir, 'tasks.json'), 'utf-8'));
    expect(config.tasks.LabelAdd).toHaveLength(1);
    expect(existsSync(join(tempDir, 'hooks.json'))).toBe(false);
  });

  it('uses timestamped backup name if hooks.json.old already exists', () => {
    writeFileSync(join(tempDir, 'hooks.json.old'), 'previous backup');
    writeFileSync(join(tempDir, 'hooks.json'), JSON.stringify({
      hooks: {
        LabelAdd: [{ hooks: [{ type: 'command', command: 'echo hi' }] }],
      },
    }));

    const migrated = migrateHooksToTasks(tempDir);
    expect(migrated).toBe(true);

    const backups = readdirSync(tempDir).filter((name) => name.startsWith('hooks.json.old'));
    expect(backups.length).toBeGreaterThanOrEqual(2);
  });
});

