import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';

// Simple LRU cache for markdown rendering to avoid re-parsing
const markdownCache = new Map<string, string>();
const CACHE_MAX_SIZE = 100;

function getCachedMarkdown(text: string): string | undefined {
  return markdownCache.get(text);
}

function setCachedMarkdown(text: string, rendered: string): void {
  // Evict oldest entries if cache is full
  if (markdownCache.size >= CACHE_MAX_SIZE) {
    const firstKey = markdownCache.keys().next().value;
    if (firstKey) markdownCache.delete(firstKey);
  }
  markdownCache.set(text, rendered);
}

// Configure marked for terminal output
marked.use(
  markedTerminal({
    // Code block styling
    code: chalk.cyan,
    blockquote: chalk.gray.italic,
    html: chalk.gray,
    heading: chalk.bold.white,
    firstHeading: chalk.bold.magenta,
    hr: chalk.gray,
    listitem: chalk.white,
    list: (body: string) => body,
    table: chalk.white,
    paragraph: chalk.white,
    strong: chalk.bold,
    em: chalk.italic,
    codespan: chalk.cyan,
    del: chalk.strikethrough,
    link: chalk.blue.underline,
    href: chalk.blue,
    // Use unicode for bullets
    showSectionPrefix: false,
    unescape: true,
    width: 80,
  })
);

/**
 * Render markdown text for terminal display (with caching)
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';

  // Check cache first
  const cached = getCachedMarkdown(text);
  if (cached !== undefined) {
    return cached;
  }

  try {
    // Parse and render markdown
    const rendered = marked.parse(text, { async: false }) as string;
    // Trim trailing newlines but preserve internal formatting
    const result = rendered.replace(/\n+$/, '');
    setCachedMarkdown(text, result);
    return result;
  } catch {
    // If markdown parsing fails, return original text
    return text;
  }
}

/**
 * Render inline markdown (no block elements)
 */
export function renderInlineMarkdown(text: string): string {
  if (!text) return '';

  try {
    const rendered = marked.parseInline(text, { async: false }) as string;
    return rendered;
  } catch {
    return text;
  }
}

/**
 * Truncate text with ellipsis, preserving word boundaries
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const truncated = text.slice(0, maxLength - 3);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.7) {
    return truncated.slice(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Format JSON for display (with truncation)
 */
export function formatJSON(obj: unknown, maxLength = 200): string {
  try {
    const str = JSON.stringify(obj, null, 2);
    if (str.length > maxLength) {
      return str.slice(0, maxLength - 3) + '...';
    }
    return str;
  } catch {
    return String(obj);
  }
}

/**
 * Format a duration in ms to human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Format token count
 */
export function formatTokens(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1000000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1000000).toFixed(2)}M`;
}

/**
 * Estimate cost based on token usage (Claude 3.5 Sonnet pricing)
 */
export function estimateCost(inputTokens: number, outputTokens: number): string {
  // Claude 3.5 Sonnet: $3/M input, $15/M output
  const inputCost = (inputTokens / 1000000) * 3;
  const outputCost = (outputTokens / 1000000) * 15;
  const total = inputCost + outputCost;

  if (total < 0.01) {
    return `$${total.toFixed(4)}`;
  }
  return `$${total.toFixed(2)}`;
}
