import { Type } from '@sinclair/typebox';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import TurndownService from 'turndown';
import { parse as parseHtml } from 'node-html-parser';

const schema = Type.Object({
  url: Type.String({ description: 'URL to fetch' }),
  prompt: Type.Optional(
    Type.String({
      description:
        'What to extract from the page (optional — returns full content if omitted)',
    }),
  ),
});

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// Remove noise elements
turndown.remove([
  'script',
  'style',
  'nav',
  'footer',
  'header',
  'aside',
  'noscript',
  'iframe',
]);

export const webFetchTool: AgentTool<typeof schema> = {
  name: 'web_fetch',
  label: 'Web Fetch',
  description:
    'Fetch a URL and extract its content as markdown. Use for reading documentation, articles, or any web page.',
  parameters: schema,
  async execute(toolCallId, params) {
    const { url, prompt } = params;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CraftAgent/1.0)',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`,
          },
        ],
        details: { isError: true },
      };
    }

    const contentType = response.headers.get('content-type') || '';
    const html = await response.text();

    // If not HTML, return raw text (JSON, plain text, etc.)
    if (!contentType.includes('html')) {
      const truncated = html.slice(0, 50_000);
      return { content: [{ type: 'text', text: truncated }], details: {} };
    }

    // Parse HTML, strip noise, convert to markdown
    const root = parseHtml(html);
    root
      .querySelectorAll('script, style, nav, footer, noscript, iframe, svg')
      .forEach((el) => el.remove());

    // Try to find main content
    const mainContent =
      root.querySelector(
        'main, article, [role="main"], .content, #content',
      ) ||
      root.querySelector('body') ||
      root;

    const markdown = turndown.turndown(mainContent.innerHTML);

    // Truncate if very large
    const maxLen = 50_000;
    const result =
      markdown.length > maxLen
        ? markdown.slice(0, maxLen) + '\n\n[Content truncated]'
        : markdown;

    const prefix = prompt
      ? `Content from ${url} (asked: "${prompt}"):\n\n`
      : `Content from ${url}:\n\n`;

    return {
      content: [{ type: 'text', text: prefix + result }],
      details: {},
    };
  },
};
