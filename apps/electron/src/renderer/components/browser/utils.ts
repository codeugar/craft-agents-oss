/**
 * Shared browser component utilities
 */

export function getHostname(url: string): string {
  try {
    if (url === 'about:blank' || !url) return 'New Tab'
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
