/**
 * Logo URL utility
 *
 * Returns Google Favicon URLs for APIs and MCP servers.
 * Browser handles caching - no need to save files locally.
 */

// Google Favicon API - free, reliable, no API key needed
const GOOGLE_FAVICON_URL = 'https://www.google.com/s2/favicons?domain=';

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Extract root domain from hostname (strips subdomains like api., www., etc.)
 * e.g., "api.github.com" -> "github.com"
 *       "mcp.linear.app" -> "linear.app"
 */
export function extractRootDomain(hostname: string): string {
  const parts = hostname.split('.');

  // Handle special TLDs like .co.uk, .com.au, etc.
  const specialTlds = ['co.uk', 'com.au', 'co.nz', 'co.jp', 'com.br', 'co.in'];
  const lastTwo = parts.slice(-2).join('.');

  if (specialTlds.includes(lastTwo) && parts.length > 2) {
    // Return last 3 parts: example.co.uk
    return parts.slice(-3).join('.');
  }

  // Return last 2 parts: github.com
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }

  return hostname;
}

/**
 * Get logo URL for a service
 * Returns Google Favicon URL or null for internal domains
 */
export function getLogoUrl(serviceUrl: string): string | null {
  const fullDomain = extractDomain(serviceUrl);
  if (!fullDomain) {
    return null;
  }

  // Skip internal domains
  if (fullDomain === 'localhost' || fullDomain.endsWith('.local') || /^[\d.]+$/.test(fullDomain)) {
    return null;
  }

  // Extract root domain (strips subdomains like api., www., etc.)
  const rootDomain = extractRootDomain(fullDomain);

  // Return Google Favicon URL - browser handles caching
  return `${GOOGLE_FAVICON_URL}${rootDomain}&sz=128`;
}
