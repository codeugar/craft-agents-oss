import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { SessionManager } from './sessions'
import { registerIpcHandlers } from './ipc'

// Check if running in development mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow: BrowserWindow | null = null
let sessionManager: SessionManager | null = null

function createWindow(): void {
  // Load app icon (PNG works cross-platform, but check if it exists)
  const iconPath = join(__dirname, '../resources/icon.png')
  const iconExists = existsSync(iconPath)

  if (!iconExists) {
    console.warn('[Main] App icon not found at:', iconPath)
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'Craft Agent',
    icon: iconExists ? iconPath : undefined,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true // Enable webview for browser panel
    }
  })

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Handle navigation in webviews to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow navigation within the app, but open external URLs in browser
    if (!url.startsWith('file://')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // Load the renderer
  mainWindow.loadFile(join(__dirname, 'renderer/index.html'))

  // Open DevTools only in development mode
  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Update session manager with new window reference
  if (sessionManager) {
    sessionManager.setMainWindow(mainWindow)
  }
}

app.whenReady().then(async () => {
  app.setName('Craft Agent')

  try {
    // Initialize session manager first
    sessionManager = new SessionManager()

    // Register IPC handlers (must happen before window creation)
    registerIpcHandlers(sessionManager)

    // Create the main window
    createWindow()

    // Initialize auth (must happen after window creation for error reporting)
    await sessionManager.initialize()

    console.log('[Main] App initialized successfully')
  } catch (error) {
    console.error('[Main] Failed to initialize app:', error)
    // Continue anyway - the app will show errors in the UI
  }

  // macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // On macOS, apps typically stay active until explicitly quit
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled rejection at:', promise, 'reason:', reason)
})
