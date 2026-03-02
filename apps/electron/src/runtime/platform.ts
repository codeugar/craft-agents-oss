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

export interface PlatformServices {
  // -- Path resolution --
  appRootPath: string
  resourcesPath: string
  isPackaged: boolean

  // -- Image processing (nativeImage on Electron, sharp on Node) --
  resizeImage?(buffer: Buffer, maxSize: number): Promise<Buffer>

  // -- OS integration (no-ops on headless) --
  openPath?(path: string): Promise<void>
  openExternal?(url: string): Promise<void>
  showItemInFolder?(path: string): void

  // -- Observability --
  logger: Logger
  captureError?(error: Error): void
}
