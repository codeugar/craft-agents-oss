import { describe, it, expect } from 'bun:test';
import { BLOCKED_ENV_VARS, createSanitizedEnv } from './sandbox-env.ts';

describe('sandbox-env', () => {
  it('strips all blocked credential vars', () => {
    const base: NodeJS.ProcessEnv = {
      SAFE_VAR: 'ok',
    };

    for (const key of BLOCKED_ENV_VARS) {
      base[key] = `${key.toLowerCase()}-secret`;
    }

    const sanitized = createSanitizedEnv(base);

    expect(sanitized.SAFE_VAR).toBe('ok');
    for (const key of BLOCKED_ENV_VARS) {
      expect(sanitized[key]).toBeUndefined();
    }
  });
});
