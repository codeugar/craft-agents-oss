/**
 * Module-level PlatformServices for model fetchers.
 * Avoids circular imports (index.ts → registry.ts → fetchers → index.ts).
 * Must be initialized via setFetcherPlatform() before any model fetching.
 */
import type { PlatformServices } from '../../runtime/platform'

let _platform: PlatformServices | null = null

export function setFetcherPlatform(platform: PlatformServices): void {
  _platform = platform
}

export function getHostRuntime() {
  if (!_platform) throw new Error('setFetcherPlatform() must be called before model fetching')
  return {
    appRootPath: _platform.appRootPath,
    resourcesPath: _platform.resourcesPath,
    isPackaged: _platform.isPackaged,
  }
}
