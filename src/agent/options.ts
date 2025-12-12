import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { join } from "path";
import { homedir } from "os";

declare const CRAFT_AGENT_CLI_VERSION: string | undefined;

export function getDefaultOptions(): Partial<Options> {
    if (typeof CRAFT_AGENT_CLI_VERSION !== 'undefined' && CRAFT_AGENT_CLI_VERSION != null) {
        const baseDir = join(homedir(), '.local', 'share', 'craft', 'versions', CRAFT_AGENT_CLI_VERSION);
        return {
            pathToClaudeCodeExecutable: join(baseDir, 'claude-agent-sdk', 'cli.js'),
            // Use the compiled binary itself as the runtime via BUN_BE_BUN=1
            // This makes the compiled Bun executable act as the full Bun CLI,
            // eliminating the need for external Node or Bun installation
            executable: process.execPath as 'bun',
            // Inject cache-ttl-interceptor into SDK subprocess to patch fetch for extended TTL
            executableArgs: ['--preload', join(baseDir, 'cache-ttl-interceptor.ts')],
            env: {
                ...process.env,
                BUN_BE_BUN: '1',
                CRAFT_DEBUG: process.argv.includes('--debug') ? '1' : '0',
            }
        }
    }
    return {};
}