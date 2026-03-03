/**
 * ChatGPT backend search provider — for ChatGPT Plus / OpenAI OAuth users.
 *
 * Uses the same Responses API format as the public OpenAI API, but hits the
 * ChatGPT backend endpoint which accepts OAuth access tokens instead of API keys.
 *
 * Auth flow mirrors the Pi SDK's `openai-codex-responses.js`:
 *   - Bearer token: the OAuth access token
 *   - chatgpt-account-id: extracted from the JWT's claims
 */

import type { WebSearchProvider, WebSearchResult } from '../types.ts';
import { parseResponsesApiResults, type ResponsesApiResponse } from './responses-api-parser.ts';

const SEARCH_MODEL = 'gpt-4o-mini';
const API_BASE = 'https://chatgpt.com/backend-api/codex';
const JWT_CLAIM_PATH = 'https://api.openai.com/auth';

/**
 * Extract the `chatgpt_account_id` from a ChatGPT OAuth access token (JWT).
 * Returns null if the token is malformed or the claim is missing.
 */
export function extractChatGptAccountId(accessToken: string): string | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]!));
    const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id;

    return typeof accountId === 'string' && accountId.length > 0 ? accountId : null;
  } catch {
    return null;
  }
}

export class ChatGPTBackendSearchProvider implements WebSearchProvider {
  name = 'ChatGPT';

  constructor(
    private accessToken: string,
    private accountId: string,
  ) {}

  async search(query: string, count: number): Promise<WebSearchResult[]> {
    const response = await fetch(`${API_BASE}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
        'chatgpt-account-id': this.accountId,
      },
      body: JSON.stringify({
        model: SEARCH_MODEL,
        tools: [{ type: 'web_search' }],
        input: `Search the web for: ${query}\n\nReturn the top ${count} results with title, URL, and a brief description.`,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ChatGPT search failed (HTTP ${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as ResponsesApiResponse;
    return parseResponsesApiResults(data, query, count);
  }
}
