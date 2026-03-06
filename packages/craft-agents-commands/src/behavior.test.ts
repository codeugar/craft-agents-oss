import { describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

interface CliResult {
  exitCode: number
  stdout: string
  stderr: string
  json: any
}

function runCli(args: string[], workspaceRoot: string, extraEnv: Record<string, string> = {}): CliResult {
  const cliPath = resolve(import.meta.dir, 'main.ts')
  const docPath = resolve(import.meta.dir, '../../../apps/electron/resources/docs/craft-cli.md')

  const proc = Bun.spawnSync({
    cmd: ['bun', 'run', cliPath, ...args],
    env: {
      ...process.env,
      CRAFT_WORKSPACE_PATH: workspaceRoot,
      CRAFT_COMMANDS_DOC_PATH: docPath,
      CRAFT_CLI_DOC_PATH: docPath,
      ...extraEnv,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const stdout = proc.stdout.toString('utf-8').trim()
  const stderr = proc.stderr.toString('utf-8').trim()

  let json: any = null
  try {
    json = JSON.parse(stdout)
  } catch {
    json = null
  }

  return {
    exitCode: proc.exitCode,
    stdout,
    stderr,
    json,
  }
}

function createWorkspaceFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'craft-commands-'))
  mkdirSync(join(root, 'sources'), { recursive: true })
  mkdirSync(join(root, 'skills'), { recursive: true })
  writeFileSync(join(root, 'automations.json'), JSON.stringify({ version: 2, automations: {} }, null, 2))
  return root
}

describe('craft-agents-commands behavior', () => {
  it('source create/update/validate/test/delete flow works with immutability checks', () => {
    const ws = createWorkspaceFixture()

    const create = runCli([
      'source',
      'create',
      '--name',
      'Local Docs',
      '--provider',
      'filesystem',
      '--type',
      'local',
      '--path',
      ws,
      '--icon',
      '📁',
    ], ws)
    expect(create.exitCode).toBe(0)
    const slug = create.json?.data?.source?.config?.slug as string
    expect(typeof slug).toBe('string')

    const update = runCli([
      'source',
      'update',
      slug,
      '--json',
      JSON.stringify({ enabled: false }),
    ], ws)
    expect(update.exitCode).toBe(0)
    expect(update.json?.data?.source?.config?.enabled).toBe(false)

    const immutableReject = runCli([
      'source',
      'update',
      slug,
      '--json',
      JSON.stringify({ slug: 'nope' }),
    ], ws)
    expect(immutableReject.exitCode).toBe(2)
    expect(immutableReject.json?.error?.message).toContain('cannot change slug')

    const validate = runCli(['source', 'validate', slug], ws)
    expect(validate.exitCode).toBe(0)
    expect(validate.json?.data?.valid).toBe(true)
    expect(Array.isArray(validate.json?.data?.warnings)).toBe(true)

    const test = runCli(['source', 'test', slug], ws)
    expect(test.exitCode).toBe(0)
    expect(Array.isArray(test.json?.data?.checks)).toBe(true)
    expect(Array.isArray(test.json?.data?.limitations)).toBe(true)

    const del = runCli(['source', 'delete', slug], ws)
    expect(del.exitCode).toBe(0)
    expect(del.json?.data?.deleted).toBe(slug)
  })

  it('skill update is transactional and does not persist invalid content', () => {
    const ws = createWorkspaceFixture()

    const create = runCli([
      'skill',
      'create',
      '--name',
      'Commit Helper',
      '--description',
      'Helps with commits',
      '--slug',
      'commit-helper',
      '--body',
      'Use concise commit messages.',
    ], ws)
    expect(create.exitCode).toBe(0)

    const skillPath = join(ws, 'skills', 'commit-helper', 'SKILL.md')
    const before = readFileSync(skillPath, 'utf-8')

    const invalidUpdate = runCli([
      'skill',
      'update',
      'commit-helper',
      '--json',
      JSON.stringify({ description: '' }),
    ], ws)

    expect(invalidUpdate.exitCode).toBe(2)
    const after = readFileSync(skillPath, 'utf-8')
    expect(after).toBe(before)
  })

  it('automation operational actions work across create/enable/disable/duplicate/test/lint', () => {
    const ws = createWorkspaceFixture()

    const create = runCli([
      'automation',
      'create',
      '--event',
      'UserPromptSubmit',
      '--prompt',
      'Summarize @linear updates',
    ], ws)
    expect(create.exitCode).toBe(0)

    const id = create.json?.data?.matcher?.id as string
    expect(typeof id).toBe('string')

    const disable = runCli(['automation', 'disable', id], ws)
    expect(disable.exitCode).toBe(0)
    expect(disable.json?.data?.enabled).toBe(false)

    const enable = runCli(['automation', 'enable', id], ws)
    expect(enable.exitCode).toBe(0)
    expect(enable.json?.data?.enabled).toBe(true)

    const duplicate = runCli(['automation', 'duplicate', id], ws)
    expect(duplicate.exitCode).toBe(0)
    expect(duplicate.json?.data?.duplicated?.id).toBeTruthy()

    const test = runCli(['automation', 'test', id, '--match', 'UserPromptSubmit'], ws)
    expect(test.exitCode).toBe(0)
    expect(test.json?.data?.matched).toBe(true)

    const lint = runCli(['automation', 'lint'], ws)
    expect(lint.exitCode).toBe(0)
    expect(typeof lint.json?.data?.valid).toBe('boolean')
  })

  it('automation update accepts prompt shorthand in --json payload', () => {
    const ws = createWorkspaceFixture()

    const create = runCli([
      'automation',
      'create',
      '--event',
      'UserPromptSubmit',
      '--prompt',
      'Initial prompt',
    ], ws)
    expect(create.exitCode).toBe(0)

    const id = create.json?.data?.matcher?.id as string
    const update = runCli([
      'automation',
      'update',
      id,
      '--json',
      JSON.stringify({ prompt: 'Updated prompt from json payload' }),
    ], ws)

    expect(update.exitCode).toBe(0)
    expect(update.json?.data?.matcher?.actions?.[0]?.prompt).toBe('Updated prompt from json payload')
  })

  it('skill validate returns usage error when skill is missing', () => {
    const ws = createWorkspaceFixture()
    const result = runCli(['skill', 'validate', 'does-not-exist'], ws)

    expect(result.exitCode).toBe(2)
    expect(result.json?.ok).toBe(false)
    expect(result.json?.error?.message).toContain('Skill not found')
  })

  it('json-only mode suppresses debug/perf stderr noise', () => {
    const ws = createWorkspaceFixture()

    const create = runCli([
      'source',
      'create',
      '--name',
      'Json Only Source',
      '--provider',
      'filesystem',
      '--type',
      'local',
      '--path',
      ws,
    ], ws, {
      CRAFT_DEBUG: '1',
      CRAFT_CLI_JSON_ONLY: '1',
    })

    expect(create.exitCode).toBe(0)
    expect(create.stderr).toBe('')
  })
})
