/**
 * Tasks Config Path Resolver & Migration
 *
 * Resolves the correct config file path (tasks.json or hooks.json fallback)
 * and provides one-time migration from hooks.json → tasks.json.
 */

import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

/**
 * Generate a short 6-character hex ID for matcher identification.
 * Uses crypto.randomBytes for uniqueness (24 bits of entropy = 16M possibilities).
 */
export function generateShortId(): string {
  return randomBytes(3).toString('hex');
}

interface ConfigInspection {
  exists: boolean;
  valid: boolean;
  nonEmpty: boolean;
  parsed?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasAnyMatchers(eventMap: unknown): boolean {
  if (!isRecord(eventMap)) return false;
  return Object.values(eventMap).some(
    (matchers) => Array.isArray(matchers) && matchers.length > 0
  );
}

function inspectConfig(path: string): ConfigInspection {
  if (!existsSync(path)) {
    return { exists: false, valid: false, nonEmpty: false };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    if (!isRecord(parsed)) {
      return { exists: true, valid: false, nonEmpty: false };
    }

    const eventMap = parsed.tasks ?? parsed.hooks;
    return {
      exists: true,
      valid: true,
      nonEmpty: hasAnyMatchers(eventMap),
      parsed,
    };
  } catch {
    return { exists: true, valid: false, nonEmpty: false };
  }
}

function getUniqueBackupPath(basePath: string): string {
  if (!existsSync(basePath)) return basePath;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${basePath}.${timestamp}`;
}

function toTasksConfig(sourceConfig: Record<string, unknown>): Record<string, unknown> {
  const config = { ...sourceConfig };

  // Rewrite top-level "hooks" → "tasks"
  const hooks = isRecord(config.hooks) ? config.hooks : (isRecord(config.tasks) ? config.tasks : {});
  delete config.hooks;

  // Rewrite inner "hooks" arrays → "actions" in each matcher
  const tasks: Record<string, unknown[]> = {};
  for (const [event, matchers] of Object.entries(hooks)) {
    if (!Array.isArray(matchers)) continue;
    tasks[event] = matchers.map((matcher: unknown) => {
      const matcherObj = isRecord(matcher) ? matcher : {};
      const { hooks: innerHooks, actions: innerActions, id, ...rest } = matcherObj;
      const matcherId = typeof id === 'string' && id.length > 0 ? id : generateShortId();
      return { id: matcherId, ...rest, actions: innerActions ?? innerHooks ?? [] };
    });
  }

  config.tasks = tasks;
  config.version = 2;
  return config;
}

/**
 * Resolve the tasks config path for a workspace.
 * Prefers tasks.json, but if both files exist and tasks.json is invalid/empty while hooks.json
 * is valid/non-empty, temporarily falls back to hooks.json to avoid losing user tasks.
 */
export function resolveTasksConfigPath(workspaceRoot: string): string {
  const tasksPath = join(workspaceRoot, 'tasks.json');
  const hooksPath = join(workspaceRoot, 'hooks.json');

  const tasksInfo = inspectConfig(tasksPath);
  const hooksInfo = inspectConfig(hooksPath);

  // Coexistence case: both files exist. Use tasks.json unless it is invalid/empty and hooks.json
  // still contains valid data.
  if (tasksInfo.exists && hooksInfo.exists) {
    if (tasksInfo.valid && tasksInfo.nonEmpty) return tasksPath;

    if ((!tasksInfo.valid || !tasksInfo.nonEmpty) && hooksInfo.valid && hooksInfo.nonEmpty) {
      console.warn(
        '[tasks] Both tasks.json and hooks.json exist; falling back to hooks.json because tasks.json is empty/invalid. hooks.json is deprecated and will be migrated on load.'
      );
      return hooksPath;
    }

    // Keep tasks.json as canonical for all other coexistence states.
    return tasksPath;
  }

  if (tasksInfo.exists) return tasksPath;
  if (hooksInfo.exists) return hooksPath;
  return tasksPath; // default for new files
}

/**
 * Migrate hooks.json → tasks.json if needed.
 *
 * Rewrites:
 * - Top-level "hooks" key → "tasks"
 * - Inner matcher "hooks" arrays → "actions"
 * - Sets version to 2
 *
 * Creates hooks.json.old as backup.
 * No-op if tasks.json already exists or hooks.json doesn't exist.
 *
 * @returns true if migration was performed, false otherwise
 */
export function migrateHooksToTasks(workspaceRoot: string): boolean {
  const tasksPath = join(workspaceRoot, 'tasks.json');
  const hooksPath = join(workspaceRoot, 'hooks.json');
  const hooksInfo = inspectConfig(hooksPath);
  const tasksInfo = inspectConfig(tasksPath);

  if (!hooksInfo.exists) return false;

  const shouldMigrate =
    !tasksInfo.exists ||
    ((!tasksInfo.valid || !tasksInfo.nonEmpty) && hooksInfo.valid && hooksInfo.nonEmpty);

  if (!shouldMigrate) {
    return false;
  }

  if (!hooksInfo.valid || !hooksInfo.parsed) {
    console.warn('[tasks] Migration skipped: hooks.json exists but is invalid JSON');
    return false;
  }

  try {
    const config = toTasksConfig(hooksInfo.parsed);

    // Always write canonical tasks.json
    writeFileSync(tasksPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    // Rename hooks.json → hooks.json.old (with timestamp fallback if needed)
    const backupPath = getUniqueBackupPath(join(workspaceRoot, 'hooks.json.old'));
    renameSync(hooksPath, backupPath);

    console.warn(`[tasks] Migrated hooks.json → tasks.json (backup at ${backupPath})`);
    return true;
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    console.warn('[tasks] Migration failed; keeping existing files as-is:', error);
    return false;
  }
}
