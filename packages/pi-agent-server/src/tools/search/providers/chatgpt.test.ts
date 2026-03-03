import { afterEach, describe, expect, it } from 'bun:test';
import { ChatGPTBackendSearchProvider, extractChatGptAccountId } from './chatgpt.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Build a minimal JWT with the given claims payload. */
function makeJwt(claims: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify(claims));
  return `${header}.${payload}.fakesignature`;
}

describe('extractChatGptAccountId', () => {
  it('extracts accountId from a valid ChatGPT JWT', () => {
    const token = makeJwt({
      'https://api.openai.com/auth': {
        chatgpt_account_id: 'acc_12345',
      },
    });

    expect(extractChatGptAccountId(token)).toBe('acc_12345');
  });

  it('returns null for a JWT without the claim path', () => {
    const token = makeJwt({ sub: 'user_abc', iat: 1234567890 });

    expect(extractChatGptAccountId(token)).toBeNull();
  });

  it('returns null for a JWT with empty accountId', () => {
    const token = makeJwt({
      'https://api.openai.com/auth': {
        chatgpt_account_id: '',
      },
    });

    expect(extractChatGptAccountId(token)).toBeNull();
  });

  it('returns null for a non-JWT string', () => {
    expect(extractChatGptAccountId('not-a-jwt')).toBeNull();
    expect(extractChatGptAccountId('')).toBeNull();
  });

  it('returns null for malformed base64', () => {
    expect(extractChatGptAccountId('a.!!!invalid!!!.c')).toBeNull();
  });
});

describe('ChatGPTBackendSearchProvider', () => {
  it('calls ChatGPT backend endpoint with correct auth headers', async () => {
    let calledUrl = '';
    let calledHeaders: Record<string, string> = {};
    let calledBody: any = null;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calledUrl = typeof input === 'string' ? input : input.toString();
      calledHeaders = (init?.headers as Record<string, string>) || {};
      calledBody = init?.body ? JSON.parse(String(init.body)) : null;

      return new Response(
        JSON.stringify({
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: 'ChatGPT search results.',
                  annotations: [
                    { type: 'url_citation', url: 'https://example.com', title: 'Example' },
                  ],
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    const provider = new ChatGPTBackendSearchProvider('my-access-token', 'acc_12345');
    const results = await provider.search('test query', 5);

    expect(provider.name).toBe('ChatGPT');
    expect(calledUrl).toBe('https://chatgpt.com/backend-api/codex/responses');
    expect(calledHeaders['Authorization']).toBe('Bearer my-access-token');
    expect(calledHeaders['chatgpt-account-id']).toBe('acc_12345');
    expect(calledBody.model).toBe('gpt-4o-mini');
    expect(calledBody.tools).toEqual([{ type: 'web_search' }]);
    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe('https://example.com');
  });

  it('throws on HTTP error', async () => {
    globalThis.fetch = (async () => {
      return new Response('Unauthorized', { status: 401 });
    }) as typeof fetch;

    const provider = new ChatGPTBackendSearchProvider('bad-token', 'acc_123');

    await expect(provider.search('test', 5)).rejects.toThrow('ChatGPT search failed (HTTP 401)');
  });
});
