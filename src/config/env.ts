import { z } from 'zod';

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  CRAFT_MCP_URL: z.string().url('CRAFT_MCP_URL must be a valid URL'),
  CRAFT_MCP_TOKEN: z.string().min(1, 'CRAFT_MCP_TOKEN is required'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues || [];
    const errorMessages: string[] = [];
    for (const issue of issues) {
      const path = String(issue.path?.join('.') || 'unknown');
      const message = String(issue.message || 'validation error');
      errorMessages.push(`  - ${path}: ${message}`);
    }
    console.error('Environment validation failed:\n' + errorMessages.join('\n'));
    console.error('\nPlease set the required environment variables or create a .env file.');
    process.exit(1);
  }

  return result.data;
}

export interface Config {
  env: Env;
  mcpUrl?: string;
  mcpToken?: string;
}

export function createConfig(cliOptions: { url?: string; token?: string } = {}): Config {
  const env = loadEnv();

  return {
    env,
    mcpUrl: cliOptions.url || env.CRAFT_MCP_URL,
    mcpToken: cliOptions.token || env.CRAFT_MCP_TOKEN,
  };
}
