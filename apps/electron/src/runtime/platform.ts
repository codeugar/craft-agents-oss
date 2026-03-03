/**
 * Platform services — dependency injection seam.
 *
 * SessionManager and core handlers receive this instead of importing
 * directly from 'electron'. On Electron, the implementations wrap
 * app/shell/nativeImage. On headless Node, they use sharp/pino/etc.
 */

export interface Logger {
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  debug(...args: unknown[]): void
}

export interface ImageProcessor {
  /** Get image dimensions. Returns null if buffer is not a valid image. */
  getMetadata(buffer: Buffer): Promise<{ width: number; height: number } | null>

  /**
   * Process an image: resize and/or re-encode.
   * @param input - Buffer or file path
   * @param opts.resize - target dimensions (default: no resize)
   * @param opts.fit - 'inside' to maintain aspect ratio (default: 'inside')
   * @param opts.format - output format (default: 'png')
   * @param opts.quality - JPEG quality 0-100 (default: 90)
   */
  process(
    input: Buffer | string,
    opts?: {
      resize?: { width: number; height: number }
      fit?: 'inside' | 'cover' | 'fill'
      format?: 'png' | 'jpeg'
      quality?: number
    },
  ): Promise<Buffer>
}

export interface PlatformServices {
  // -- Path resolution --
  appRootPath: string
  resourcesPath: string
  isPackaged: boolean

  // -- App metadata --
  appVersion: string

  // -- Image processing (nativeImage on Electron, sharp on headless) --
  imageProcessor: ImageProcessor

  // -- OS integration (no-ops on headless) --
  openPath?(path: string): Promise<void>
  openExternal?(url: string): Promise<void>
  showItemInFolder?(path: string): void

  // -- App lifecycle (no-ops on headless) --
  quit?(): void
  systemDarkMode?(): boolean

  // -- Observability --
  logger: Logger
  captureError?(error: Error): void
}
