/**
 * Logo URL utility
 *
 * Returns Google Favicon URLs for APIs and MCP servers.
 * Browser handles caching - no need to save files locally.
 */

// Google Favicon V2 API - free, reliable, no API key needed
// Updated URL: Google migrated from /s2/favicons to faviconV2
const GOOGLE_FAVICON_URL = 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=';

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
 * Common high-resolution favicon paths to try (in order of preference)
 */
const HIGH_RES_FAVICON_PATHS = [
  '/favicon.svg',              // SVG - best quality, scalable
  '/apple-touch-icon.png',     // Usually 180x180
  '/favicon.png',              // Common high-res PNG
  '/android-chrome-512x512.png', // Often 512x512
  '/fluidicon.png',            // GitHub-specific, 512x512
  '/icon.svg',                 // Alternative SVG path
];

/**
 * Check if a URL exists and returns an image (returns true for 2xx status codes with image content-type)
 */
async function urlExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) return false;

    // Verify it's actually an image, not HTML
    const contentType = response.headers.get('content-type');
    if (!contentType) return false;

    // Accept image types (svg, png, ico, etc.)
    return contentType.startsWith('image/');
  } catch {
    return false;
  }
}

/**
 * Parse favicon links from HTML <head> section
 * Returns array of {href: string, sizes: string | null} objects
 */
async function parseFaviconsFromHtml(url: string): Promise<Array<{href: string, sizes: string | null}>> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' } // Some sites block headless requests
    });

    if (!response.ok) return [];

    const html = await response.text();

    // Extract <head> section (basic regex - good enough for favicon parsing)
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    if (!headMatch) return [];

    const head = headMatch[1];

    // Find all <link> tags with rel containing "icon"
    const linkRegex = /<link\s+([^>]*rel=["'](?:[^"']*\s)?(?:icon|apple-touch-icon)(?:\s[^"']*)?["'][^>]*)>/gi;
    const favicons: Array<{href: string, sizes: string | null}> = [];

    let match;
    while ((match = linkRegex.exec(head)) !== null) {
      const attrs = match[1];

      // Extract href attribute
      const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
      if (!hrefMatch) continue;

      let href = hrefMatch[1];

      // Convert relative URLs to absolute
      if (href.startsWith('//')) {
        href = `https:${href}`;
      } else if (href.startsWith('/')) {
        const origin = new URL(url).origin;
        href = `${origin}${href}`;
      } else if (!href.startsWith('http')) {
        const baseUrl = new URL(url);
        href = `${baseUrl.origin}/${href}`;
      }

      // Extract sizes attribute (e.g., "180x180", "512x512")
      const sizesMatch = attrs.match(/sizes=["']([^"']+)["']/i);
      const sizes = sizesMatch ? sizesMatch[1] : null;

      favicons.push({ href, sizes });
    }

    return favicons;
  } catch {
    return [];
  }
}

/**
 * Pick the best favicon from parsed HTML links
 * Prefers SVG, then largest PNG/ICO by size attribute
 */
function pickBestFavicon(favicons: Array<{href: string, sizes: string | null}>): string | null {
  if (favicons.length === 0) return null;

  // Prefer SVG (scalable, always best quality)
  const svg = favicons.find(f => f.href.endsWith('.svg'));
  if (svg) return svg.href;

  // Sort by size (largest first)
  const withSizes = favicons
    .filter(f => f.sizes && f.sizes !== 'any')
    .map(f => {
      const sizeMatch = f.sizes!.match(/(\d+)x(\d+)/);
      const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;
      return { ...f, sizeNum: size };
    })
    .sort((a, b) => b.sizeNum - a.sizeNum);

  if (withSizes.length > 0 && withSizes[0].sizeNum >= 128) {
    return withSizes[0].href;
  }

  // Fall back to first available
  return favicons[0].href;
}

/**
 * Get high-quality logo URL for a service
 * Tries direct favicon paths, then parses HTML <head>, before falling back to Google API
 *
 * This function makes HTTP requests to find the best quality favicon.
 * Results should be cached (stored in source config) to avoid repeated requests.
 */
export async function getHighQualityLogoUrl(serviceUrl: string): Promise<string | null> {
  const fullDomain = extractDomain(serviceUrl);
  if (!fullDomain) {
    return null;
  }

  // Skip internal domains
  if (fullDomain === 'localhost' || fullDomain.endsWith('.local') || /^[\d.]+$/.test(fullDomain)) {
    return null;
  }

  const rootDomain = extractRootDomain(fullDomain);
  const origin = `https://${rootDomain}`;

  // Step 1: Try high-res favicon paths
  for (const path of HIGH_RES_FAVICON_PATHS) {
    const url = `${origin}${path}`;
    if (await urlExists(url)) {
      return url;
    }
  }

  // Step 2: Parse HTML <head> for favicon links
  const favicons = await parseFaviconsFromHtml(origin);
  if (favicons.length > 0) {
    const bestFavicon = pickBestFavicon(favicons);
    if (bestFavicon && await urlExists(bestFavicon)) {
      return bestFavicon;
    }
  }

  // Step 3: Fall back to Google Favicon V2 API
  return `${GOOGLE_FAVICON_URL}128&url=https://${rootDomain}`;
}

/**
 * Get logo URL for a service (synchronous, uses Google Favicon API)
 * Returns Google Favicon URL or null for internal domains
 *
 * @deprecated Use getHighQualityLogoUrl() when possible for better quality
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

  // Return Google Favicon V2 URL - browser handles caching
  return `${GOOGLE_FAVICON_URL}128&url=https://${rootDomain}`;
}
