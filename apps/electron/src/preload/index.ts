// Capture errors in the isolated preload context and forward to Sentry
import '@sentry/electron/preload'
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type ElectronAPI } from '../shared/types'
import { invoke, send, listenOne, listenVoid } from './helpers'

const api: ElectronAPI = {
  // Session management
  getSessions: invoke<ElectronAPI['getSessions']>(IPC_CHANNELS.sessions.GET),
  getUnreadSummary: invoke<ElectronAPI['getUnreadSummary']>(IPC_CHANNELS.sessions.GET_UNREAD_SUMMARY),
  markAllSessionsRead: invoke<ElectronAPI['markAllSessionsRead']>(IPC_CHANNELS.sessions.MARK_ALL_READ),
  getSessionMessages: invoke<ElectronAPI['getSessionMessages']>(IPC_CHANNELS.sessions.GET_MESSAGES),
  createSession: invoke<ElectronAPI['createSession']>(IPC_CHANNELS.sessions.CREATE),
  deleteSession: invoke<ElectronAPI['deleteSession']>(IPC_CHANNELS.sessions.DELETE),
  sendMessage: invoke<ElectronAPI['sendMessage']>(IPC_CHANNELS.sessions.SEND_MESSAGE),
  cancelProcessing: invoke<ElectronAPI['cancelProcessing']>(IPC_CHANNELS.sessions.CANCEL),
  killShell: invoke<ElectronAPI['killShell']>(IPC_CHANNELS.sessions.KILL_SHELL),
  getTaskOutput: invoke<ElectronAPI['getTaskOutput']>(IPC_CHANNELS.tasks.GET_OUTPUT),
  respondToPermission: invoke<ElectronAPI['respondToPermission']>(IPC_CHANNELS.sessions.RESPOND_TO_PERMISSION),
  respondToCredential: invoke<ElectronAPI['respondToCredential']>(IPC_CHANNELS.sessions.RESPOND_TO_CREDENTIAL),
  sessionCommand: invoke<ElectronAPI['sessionCommand']>(IPC_CHANNELS.sessions.COMMAND),
  getPendingPlanExecution: invoke<ElectronAPI['getPendingPlanExecution']>(IPC_CHANNELS.sessions.GET_PENDING_PLAN_EXECUTION),
  getSessionPermissionModeState: invoke<ElectronAPI['getSessionPermissionModeState']>(IPC_CHANNELS.sessions.GET_PERMISSION_MODE_STATE),

  // Workspace management
  getWorkspaces: invoke<ElectronAPI['getWorkspaces']>(IPC_CHANNELS.workspaces.GET),
  createWorkspace: invoke<ElectronAPI['createWorkspace']>(IPC_CHANNELS.workspaces.CREATE),
  checkWorkspaceSlug: invoke<ElectronAPI['checkWorkspaceSlug']>(IPC_CHANNELS.workspaces.CHECK_SLUG),

  // Window management
  getWindowWorkspace: invoke<ElectronAPI['getWindowWorkspace']>(IPC_CHANNELS.window.GET_WORKSPACE),
  getWindowMode: invoke<ElectronAPI['getWindowMode']>(IPC_CHANNELS.window.GET_MODE),
  openWorkspace: invoke<ElectronAPI['openWorkspace']>(IPC_CHANNELS.window.OPEN_WORKSPACE),
  openSessionInNewWindow: invoke<ElectronAPI['openSessionInNewWindow']>(IPC_CHANNELS.window.OPEN_SESSION_IN_NEW_WINDOW),
  switchWorkspace: invoke<ElectronAPI['switchWorkspace']>(IPC_CHANNELS.window.SWITCH_WORKSPACE),
  closeWindow: invoke<ElectronAPI['closeWindow']>(IPC_CHANNELS.window.CLOSE),
  confirmCloseWindow: invoke<ElectronAPI['confirmCloseWindow']>(IPC_CHANNELS.window.CONFIRM_CLOSE),
  cancelCloseWindow: invoke<ElectronAPI['cancelCloseWindow']>(IPC_CHANNELS.window.CANCEL_CLOSE),
  onCloseRequested: listenVoid(IPC_CHANNELS.window.CLOSE_REQUESTED),
  setTrafficLightsVisible: invoke<ElectronAPI['setTrafficLightsVisible']>(IPC_CHANNELS.window.SET_TRAFFIC_LIGHTS),

  // Event listeners
  onSessionEvent: listenOne<Parameters<ElectronAPI['onSessionEvent']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.sessions.EVENT),
  onUnreadSummaryChanged: listenOne<Parameters<ElectronAPI['onUnreadSummaryChanged']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.sessions.UNREAD_SUMMARY_CHANGED),

  // File operations
  readFile: invoke<ElectronAPI['readFile']>(IPC_CHANNELS.file.READ),
  readFileDataUrl: invoke<ElectronAPI['readFileDataUrl']>(IPC_CHANNELS.file.READ_DATA_URL),
  readFileBinary: invoke<ElectronAPI['readFileBinary']>(IPC_CHANNELS.file.READ_BINARY),
  openFileDialog: invoke<ElectronAPI['openFileDialog']>(IPC_CHANNELS.file.OPEN_DIALOG),
  readFileAttachment: invoke<ElectronAPI['readFileAttachment']>(IPC_CHANNELS.file.READ_ATTACHMENT),
  storeAttachment: invoke<ElectronAPI['storeAttachment']>(IPC_CHANNELS.file.STORE_ATTACHMENT),
  generateThumbnail: invoke<ElectronAPI['generateThumbnail']>(IPC_CHANNELS.file.GENERATE_THUMBNAIL),

  // Theme
  getSystemTheme: invoke<ElectronAPI['getSystemTheme']>(IPC_CHANNELS.theme.GET_SYSTEM_PREFERENCE),
  onSystemThemeChange: listenOne<Parameters<ElectronAPI['onSystemThemeChange']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.theme.SYSTEM_CHANGED),

  // System
  getVersions: () => ({
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  }),
  getHomeDir: invoke<ElectronAPI['getHomeDir']>(IPC_CHANNELS.system.HOME_DIR),
  isDebugMode: invoke<ElectronAPI['isDebugMode']>(IPC_CHANNELS.system.IS_DEBUG_MODE),

  // Auto-update
  checkForUpdates: invoke<ElectronAPI['checkForUpdates']>(IPC_CHANNELS.update.CHECK),
  getUpdateInfo: invoke<ElectronAPI['getUpdateInfo']>(IPC_CHANNELS.update.GET_INFO),
  installUpdate: invoke<ElectronAPI['installUpdate']>(IPC_CHANNELS.update.INSTALL),
  dismissUpdate: invoke<ElectronAPI['dismissUpdate']>(IPC_CHANNELS.update.DISMISS),
  getDismissedUpdateVersion: invoke<ElectronAPI['getDismissedUpdateVersion']>(IPC_CHANNELS.update.GET_DISMISSED),
  onUpdateAvailable: listenOne<Parameters<ElectronAPI['onUpdateAvailable']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.update.AVAILABLE),
  onUpdateDownloadProgress: listenOne<Parameters<ElectronAPI['onUpdateDownloadProgress']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.update.DOWNLOAD_PROGRESS),

  // Release notes
  getReleaseNotes: invoke<ElectronAPI['getReleaseNotes']>(IPC_CHANNELS.releaseNotes.GET),
  getLatestReleaseVersion: invoke<ElectronAPI['getLatestReleaseVersion']>(IPC_CHANNELS.releaseNotes.GET_LATEST_VERSION),

  // Shell operations
  openUrl: invoke<ElectronAPI['openUrl']>(IPC_CHANNELS.shell.OPEN_URL),
  openFile: invoke<ElectronAPI['openFile']>(IPC_CHANNELS.shell.OPEN_FILE),
  showInFolder: invoke<ElectronAPI['showInFolder']>(IPC_CHANNELS.shell.SHOW_IN_FOLDER),

  // Menu event listeners
  onMenuNewChat: listenVoid(IPC_CHANNELS.menu.NEW_CHAT),
  onMenuOpenSettings: listenVoid(IPC_CHANNELS.menu.OPEN_SETTINGS),
  onMenuKeyboardShortcuts: listenVoid(IPC_CHANNELS.menu.KEYBOARD_SHORTCUTS),
  onMenuToggleFocusMode: listenVoid(IPC_CHANNELS.menu.TOGGLE_FOCUS_MODE),
  onMenuToggleSidebar: listenVoid(IPC_CHANNELS.menu.TOGGLE_SIDEBAR),

  // Deep link navigation
  onDeepLinkNavigate: listenOne<Parameters<ElectronAPI['onDeepLinkNavigate']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.deeplink.NAVIGATE),

  // Auth
  showLogoutConfirmation: invoke<ElectronAPI['showLogoutConfirmation']>(IPC_CHANNELS.auth.SHOW_LOGOUT_CONFIRMATION),
  showDeleteSessionConfirmation: invoke<ElectronAPI['showDeleteSessionConfirmation']>(IPC_CHANNELS.auth.SHOW_DELETE_SESSION_CONFIRMATION),
  logout: invoke<ElectronAPI['logout']>(IPC_CHANNELS.auth.LOGOUT),
  getCredentialHealth: invoke<ElectronAPI['getCredentialHealth']>(IPC_CHANNELS.credentials.HEALTH_CHECK),

  // Onboarding
  getAuthState: () => ipcRenderer.invoke(IPC_CHANNELS.onboarding.GET_AUTH_STATE).then(r => r.authState),
  getSetupNeeds: () => ipcRenderer.invoke(IPC_CHANNELS.onboarding.GET_AUTH_STATE).then(r => r.setupNeeds),
  startWorkspaceMcpOAuth: invoke<ElectronAPI['startWorkspaceMcpOAuth']>(IPC_CHANNELS.onboarding.START_MCP_OAUTH),
  startClaudeOAuth: invoke<ElectronAPI['startClaudeOAuth']>(IPC_CHANNELS.onboarding.START_CLAUDE_OAUTH),
  exchangeClaudeCode: invoke<ElectronAPI['exchangeClaudeCode']>(IPC_CHANNELS.onboarding.EXCHANGE_CLAUDE_CODE),
  hasClaudeOAuthState: invoke<ElectronAPI['hasClaudeOAuthState']>(IPC_CHANNELS.onboarding.HAS_CLAUDE_OAUTH_STATE),
  clearClaudeOAuthState: invoke<ElectronAPI['clearClaudeOAuthState']>(IPC_CHANNELS.onboarding.CLEAR_CLAUDE_OAUTH_STATE),

  // ChatGPT OAuth
  startChatGptOAuth: invoke<ElectronAPI['startChatGptOAuth']>(IPC_CHANNELS.chatgpt.START_OAUTH),
  cancelChatGptOAuth: invoke<ElectronAPI['cancelChatGptOAuth']>(IPC_CHANNELS.chatgpt.CANCEL_OAUTH),
  getChatGptAuthStatus: invoke<ElectronAPI['getChatGptAuthStatus']>(IPC_CHANNELS.chatgpt.GET_AUTH_STATUS),
  chatGptLogout: invoke<ElectronAPI['chatGptLogout']>(IPC_CHANNELS.chatgpt.LOGOUT),

  // GitHub Copilot OAuth
  startCopilotOAuth: invoke<ElectronAPI['startCopilotOAuth']>(IPC_CHANNELS.copilot.START_OAUTH),
  cancelCopilotOAuth: invoke<ElectronAPI['cancelCopilotOAuth']>(IPC_CHANNELS.copilot.CANCEL_OAUTH),
  getCopilotAuthStatus: invoke<ElectronAPI['getCopilotAuthStatus']>(IPC_CHANNELS.copilot.GET_AUTH_STATUS),
  copilotLogout: invoke<ElectronAPI['copilotLogout']>(IPC_CHANNELS.copilot.LOGOUT),
  onCopilotDeviceCode: listenOne<Parameters<ElectronAPI['onCopilotDeviceCode']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.copilot.DEVICE_CODE),

  // Settings - API Setup
  setupLlmConnection: invoke<ElectronAPI['setupLlmConnection']>(IPC_CHANNELS.settings.SETUP_LLM_CONNECTION),
  testLlmConnectionSetup: invoke<ElectronAPI['testLlmConnectionSetup']>(IPC_CHANNELS.settings.TEST_LLM_CONNECTION_SETUP),

  // Pi provider discovery
  getPiApiKeyProviders: invoke<ElectronAPI['getPiApiKeyProviders']>(IPC_CHANNELS.pi.GET_API_KEY_PROVIDERS),
  getPiProviderBaseUrl: invoke<ElectronAPI['getPiProviderBaseUrl']>(IPC_CHANNELS.pi.GET_PROVIDER_BASE_URL),
  getPiProviderModels: invoke<ElectronAPI['getPiProviderModels']>(IPC_CHANNELS.pi.GET_PROVIDER_MODELS),

  // Session-specific model
  getSessionModel: invoke<ElectronAPI['getSessionModel']>(IPC_CHANNELS.sessions.GET_MODEL),
  setSessionModel: invoke<ElectronAPI['setSessionModel']>(IPC_CHANNELS.sessions.SET_MODEL),

  // Workspace Settings
  getWorkspaceSettings: invoke<ElectronAPI['getWorkspaceSettings']>(IPC_CHANNELS.workspace.SETTINGS_GET),
  updateWorkspaceSetting: invoke<ElectronAPI['updateWorkspaceSetting']>(IPC_CHANNELS.workspace.SETTINGS_UPDATE),

  // Folder dialog
  openFolderDialog: invoke<ElectronAPI['openFolderDialog']>(IPC_CHANNELS.dialog.OPEN_FOLDER),

  // Filesystem search
  searchFiles: invoke<ElectronAPI['searchFiles']>(IPC_CHANNELS.fs.SEARCH),

  // Debug logging (fire-and-forget)
  debugLog: send<ElectronAPI['debugLog']>(IPC_CHANNELS.debug.LOG),

  // User Preferences
  readPreferences: invoke<ElectronAPI['readPreferences']>(IPC_CHANNELS.preferences.READ),
  writePreferences: invoke<ElectronAPI['writePreferences']>(IPC_CHANNELS.preferences.WRITE),

  // Session Drafts
  getDraft: invoke<ElectronAPI['getDraft']>(IPC_CHANNELS.drafts.GET),
  setDraft: invoke<ElectronAPI['setDraft']>(IPC_CHANNELS.drafts.SET),
  deleteDraft: invoke<ElectronAPI['deleteDraft']>(IPC_CHANNELS.drafts.DELETE),
  getAllDrafts: invoke<ElectronAPI['getAllDrafts']>(IPC_CHANNELS.drafts.GET_ALL),

  // Session Info Panel
  getSessionFiles: invoke<ElectronAPI['getSessionFiles']>(IPC_CHANNELS.sessions.GET_FILES),
  getSessionNotes: invoke<ElectronAPI['getSessionNotes']>(IPC_CHANNELS.sessions.GET_NOTES),
  setSessionNotes: invoke<ElectronAPI['setSessionNotes']>(IPC_CHANNELS.sessions.SET_NOTES),
  watchSessionFiles: invoke<ElectronAPI['watchSessionFiles']>(IPC_CHANNELS.sessions.WATCH_FILES),
  unwatchSessionFiles: invoke<ElectronAPI['unwatchSessionFiles']>(IPC_CHANNELS.sessions.UNWATCH_FILES),
  onSessionFilesChanged: listenOne<Parameters<ElectronAPI['onSessionFilesChanged']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.sessions.FILES_CHANGED),

  // Sources
  getSources: invoke<ElectronAPI['getSources']>(IPC_CHANNELS.sources.GET),
  createSource: invoke<ElectronAPI['createSource']>(IPC_CHANNELS.sources.CREATE),
  deleteSource: invoke<ElectronAPI['deleteSource']>(IPC_CHANNELS.sources.DELETE),
  startSourceOAuth: invoke<ElectronAPI['startSourceOAuth']>(IPC_CHANNELS.sources.START_OAUTH),
  saveSourceCredentials: invoke<ElectronAPI['saveSourceCredentials']>(IPC_CHANNELS.sources.SAVE_CREDENTIALS),
  getSourcePermissionsConfig: invoke<ElectronAPI['getSourcePermissionsConfig']>(IPC_CHANNELS.sources.GET_PERMISSIONS),
  getWorkspacePermissionsConfig: invoke<ElectronAPI['getWorkspacePermissionsConfig']>(IPC_CHANNELS.workspace.GET_PERMISSIONS),
  getDefaultPermissionsConfig: invoke<ElectronAPI['getDefaultPermissionsConfig']>(IPC_CHANNELS.permissions.GET_DEFAULTS),
  onDefaultPermissionsChanged: listenVoid(IPC_CHANNELS.permissions.DEFAULTS_CHANGED),
  getMcpTools: invoke<ElectronAPI['getMcpTools']>(IPC_CHANNELS.sources.GET_MCP_TOOLS),

  // Session content search
  searchSessionContent: invoke<ElectronAPI['searchSessionContent']>(IPC_CHANNELS.sessions.SEARCH_CONTENT),

  // Statuses
  listStatuses: invoke<ElectronAPI['listStatuses']>(IPC_CHANNELS.statuses.LIST),
  reorderStatuses: invoke<ElectronAPI['reorderStatuses']>(IPC_CHANNELS.statuses.REORDER),

  // Workspace images
  readWorkspaceImage: invoke<ElectronAPI['readWorkspaceImage']>(IPC_CHANNELS.workspace.READ_IMAGE),
  writeWorkspaceImage: invoke<ElectronAPI['writeWorkspaceImage']>(IPC_CHANNELS.workspace.WRITE_IMAGE),

  // Sources change listener
  onSourcesChanged: listenOne<Parameters<ElectronAPI['onSourcesChanged']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.sources.CHANGED),

  // Skills
  getSkills: invoke<ElectronAPI['getSkills']>(IPC_CHANNELS.skills.GET),
  getSkillFiles: invoke<NonNullable<ElectronAPI['getSkillFiles']>>(IPC_CHANNELS.skills.GET_FILES),
  deleteSkill: invoke<ElectronAPI['deleteSkill']>(IPC_CHANNELS.skills.DELETE),
  openSkillInEditor: invoke<ElectronAPI['openSkillInEditor']>(IPC_CHANNELS.skills.OPEN_EDITOR),
  openSkillInFinder: invoke<ElectronAPI['openSkillInFinder']>(IPC_CHANNELS.skills.OPEN_FINDER),
  onSkillsChanged: listenOne<Parameters<ElectronAPI['onSkillsChanged']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.skills.CHANGED),

  // Statuses change listener
  onStatusesChanged: listenOne<Parameters<ElectronAPI['onStatusesChanged']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.statuses.CHANGED),

  // Labels
  listLabels: invoke<ElectronAPI['listLabels']>(IPC_CHANNELS.labels.LIST),
  createLabel: invoke<ElectronAPI['createLabel']>(IPC_CHANNELS.labels.CREATE),
  deleteLabel: invoke<ElectronAPI['deleteLabel']>(IPC_CHANNELS.labels.DELETE),
  onLabelsChanged: listenOne<Parameters<ElectronAPI['onLabelsChanged']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.labels.CHANGED),

  // LLM connections change listener
  onLlmConnectionsChanged: listenVoid(IPC_CHANNELS.llmConnections.CHANGED),

  // Views
  listViews: invoke<ElectronAPI['listViews']>(IPC_CHANNELS.views.LIST),
  saveViews: invoke<ElectronAPI['saveViews']>(IPC_CHANNELS.views.SAVE),

  // Tool icon mappings
  getToolIconMappings: invoke<ElectronAPI['getToolIconMappings']>(IPC_CHANNELS.toolIcons.GET_MAPPINGS),

  // Theme
  getAppTheme: invoke<ElectronAPI['getAppTheme']>(IPC_CHANNELS.theme.GET_APP),
  loadPresetThemes: invoke<ElectronAPI['loadPresetThemes']>(IPC_CHANNELS.theme.GET_PRESETS),
  loadPresetTheme: invoke<ElectronAPI['loadPresetTheme']>(IPC_CHANNELS.theme.LOAD_PRESET),
  getColorTheme: invoke<ElectronAPI['getColorTheme']>(IPC_CHANNELS.theme.GET_COLOR_THEME),
  setColorTheme: invoke<ElectronAPI['setColorTheme']>(IPC_CHANNELS.theme.SET_COLOR_THEME),
  getWorkspaceColorTheme: invoke<ElectronAPI['getWorkspaceColorTheme']>(IPC_CHANNELS.theme.GET_WORKSPACE_COLOR_THEME),
  setWorkspaceColorTheme: invoke<ElectronAPI['setWorkspaceColorTheme']>(IPC_CHANNELS.theme.SET_WORKSPACE_COLOR_THEME),
  getAllWorkspaceThemes: invoke<ElectronAPI['getAllWorkspaceThemes']>(IPC_CHANNELS.theme.GET_ALL_WORKSPACE_THEMES),
  getLogoUrl: invoke<ElectronAPI['getLogoUrl']>(IPC_CHANNELS.logo.GET_URL),
  onAppThemeChange: listenOne<Parameters<ElectronAPI['onAppThemeChange']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.theme.APP_CHANGED),
  broadcastThemePreferences: invoke<ElectronAPI['broadcastThemePreferences']>(IPC_CHANNELS.theme.BROADCAST_PREFERENCES),
  onThemePreferencesChange: listenOne<Parameters<ElectronAPI['onThemePreferencesChange']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.theme.PREFERENCES_CHANGED),
  broadcastWorkspaceThemeChange: invoke<ElectronAPI['broadcastWorkspaceThemeChange']>(IPC_CHANNELS.theme.BROADCAST_WORKSPACE_THEME),
  onWorkspaceThemeChange: listenOne<Parameters<ElectronAPI['onWorkspaceThemeChange']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.theme.WORKSPACE_THEME_CHANGED),

  // Notifications
  showNotification: invoke<ElectronAPI['showNotification']>(IPC_CHANNELS.notification.SHOW),
  getNotificationsEnabled: invoke<ElectronAPI['getNotificationsEnabled']>(IPC_CHANNELS.notification.GET_ENABLED),
  setNotificationsEnabled: invoke<ElectronAPI['setNotificationsEnabled']>(IPC_CHANNELS.notification.SET_ENABLED),

  // Input settings
  getAutoCapitalisation: invoke<ElectronAPI['getAutoCapitalisation']>(IPC_CHANNELS.input.GET_AUTO_CAPITALISATION),
  setAutoCapitalisation: invoke<ElectronAPI['setAutoCapitalisation']>(IPC_CHANNELS.input.SET_AUTO_CAPITALISATION),
  getSendMessageKey: invoke<ElectronAPI['getSendMessageKey']>(IPC_CHANNELS.input.GET_SEND_MESSAGE_KEY),
  setSendMessageKey: invoke<ElectronAPI['setSendMessageKey']>(IPC_CHANNELS.input.SET_SEND_MESSAGE_KEY),
  getSpellCheck: invoke<ElectronAPI['getSpellCheck']>(IPC_CHANNELS.input.GET_SPELL_CHECK),
  setSpellCheck: invoke<ElectronAPI['setSpellCheck']>(IPC_CHANNELS.input.SET_SPELL_CHECK),

  // Power settings
  getKeepAwakeWhileRunning: invoke<ElectronAPI['getKeepAwakeWhileRunning']>(IPC_CHANNELS.power.GET_KEEP_AWAKE),
  setKeepAwakeWhileRunning: invoke<ElectronAPI['setKeepAwakeWhileRunning']>(IPC_CHANNELS.power.SET_KEEP_AWAKE),

  // Appearance settings
  getRichToolDescriptions: invoke<ElectronAPI['getRichToolDescriptions']>(IPC_CHANNELS.appearance.GET_RICH_TOOL_DESCRIPTIONS),
  setRichToolDescriptions: invoke<ElectronAPI['setRichToolDescriptions']>(IPC_CHANNELS.appearance.SET_RICH_TOOL_DESCRIPTIONS),

  // Badge
  refreshBadge: invoke<ElectronAPI['refreshBadge']>(IPC_CHANNELS.badge.REFRESH),
  setDockIconWithBadge: invoke<ElectronAPI['setDockIconWithBadge']>(IPC_CHANNELS.badge.SET_ICON),
  onBadgeDraw: listenOne<Parameters<ElectronAPI['onBadgeDraw']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.badge.DRAW),
  onBadgeDrawWindows: listenOne<Parameters<ElectronAPI['onBadgeDrawWindows']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.badge.DRAW_WINDOWS),

  // Window focus
  getWindowFocusState: invoke<ElectronAPI['getWindowFocusState']>(IPC_CHANNELS.window.GET_FOCUS_STATE),
  onWindowFocusChange: listenOne<Parameters<ElectronAPI['onWindowFocusChange']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.window.FOCUS_STATE),
  onNotificationNavigate: listenOne<Parameters<ElectronAPI['onNotificationNavigate']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.notification.NAVIGATE),

  // Git
  getGitBranch: invoke<ElectronAPI['getGitBranch']>(IPC_CHANNELS.git.GET_BRANCH),
  checkGitBash: invoke<ElectronAPI['checkGitBash']>(IPC_CHANNELS.gitbash.CHECK),
  browseForGitBash: invoke<ElectronAPI['browseForGitBash']>(IPC_CHANNELS.gitbash.BROWSE),
  setGitBashPath: invoke<ElectronAPI['setGitBashPath']>(IPC_CHANNELS.gitbash.SET_PATH),

  // Menu actions
  menuQuit: invoke<ElectronAPI['menuQuit']>(IPC_CHANNELS.menu.QUIT),
  menuNewWindow: invoke<ElectronAPI['menuNewWindow']>(IPC_CHANNELS.menu.NEW_WINDOW),
  menuMinimize: invoke<ElectronAPI['menuMinimize']>(IPC_CHANNELS.menu.MINIMIZE),
  menuMaximize: invoke<ElectronAPI['menuMaximize']>(IPC_CHANNELS.menu.MAXIMIZE),
  menuZoomIn: invoke<ElectronAPI['menuZoomIn']>(IPC_CHANNELS.menu.ZOOM_IN),
  menuZoomOut: invoke<ElectronAPI['menuZoomOut']>(IPC_CHANNELS.menu.ZOOM_OUT),
  menuZoomReset: invoke<ElectronAPI['menuZoomReset']>(IPC_CHANNELS.menu.ZOOM_RESET),
  menuToggleDevTools: invoke<ElectronAPI['menuToggleDevTools']>(IPC_CHANNELS.menu.TOGGLE_DEV_TOOLS),
  menuUndo: invoke<ElectronAPI['menuUndo']>(IPC_CHANNELS.menu.UNDO),
  menuRedo: invoke<ElectronAPI['menuRedo']>(IPC_CHANNELS.menu.REDO),
  menuCut: invoke<ElectronAPI['menuCut']>(IPC_CHANNELS.menu.CUT),
  menuCopy: invoke<ElectronAPI['menuCopy']>(IPC_CHANNELS.menu.COPY),
  menuPaste: invoke<ElectronAPI['menuPaste']>(IPC_CHANNELS.menu.PASTE),
  menuSelectAll: invoke<ElectronAPI['menuSelectAll']>(IPC_CHANNELS.menu.SELECT_ALL),

  // Browser pane management
  browserPane: {
    create: invoke<ElectronAPI['browserPane']['create']>(IPC_CHANNELS.browserPane.CREATE),
    destroy: invoke<ElectronAPI['browserPane']['destroy']>(IPC_CHANNELS.browserPane.DESTROY),
    list: invoke<ElectronAPI['browserPane']['list']>(IPC_CHANNELS.browserPane.LIST),
    navigate: invoke<ElectronAPI['browserPane']['navigate']>(IPC_CHANNELS.browserPane.NAVIGATE),
    goBack: invoke<ElectronAPI['browserPane']['goBack']>(IPC_CHANNELS.browserPane.GO_BACK),
    goForward: invoke<ElectronAPI['browserPane']['goForward']>(IPC_CHANNELS.browserPane.GO_FORWARD),
    reload: invoke<ElectronAPI['browserPane']['reload']>(IPC_CHANNELS.browserPane.RELOAD),
    stop: invoke<ElectronAPI['browserPane']['stop']>(IPC_CHANNELS.browserPane.STOP),
    focus: invoke<ElectronAPI['browserPane']['focus']>(IPC_CHANNELS.browserPane.FOCUS),
    emptyStateLaunch: invoke<ElectronAPI['browserPane']['emptyStateLaunch']>(IPC_CHANNELS.browserPane.LAUNCH),
    onStateChanged: listenOne<Parameters<ElectronAPI['browserPane']['onStateChanged']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.browserPane.STATE_CHANGED),
    onRemoved: listenOne<Parameters<ElectronAPI['browserPane']['onRemoved']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.browserPane.REMOVED),
    onInteracted: listenOne<Parameters<ElectronAPI['browserPane']['onInteracted']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.browserPane.INTERACTED),
  },

  // LLM Connections
  listLlmConnections: invoke<ElectronAPI['listLlmConnections']>(IPC_CHANNELS.llmConnections.LIST),
  listLlmConnectionsWithStatus: invoke<ElectronAPI['listLlmConnectionsWithStatus']>(IPC_CHANNELS.llmConnections.LIST_WITH_STATUS),
  getLlmConnection: invoke<ElectronAPI['getLlmConnection']>(IPC_CHANNELS.llmConnections.GET),
  getLlmConnectionApiKey: invoke<ElectronAPI['getLlmConnectionApiKey']>(IPC_CHANNELS.llmConnections.GET_API_KEY),
  saveLlmConnection: invoke<ElectronAPI['saveLlmConnection']>(IPC_CHANNELS.llmConnections.SAVE),
  deleteLlmConnection: invoke<ElectronAPI['deleteLlmConnection']>(IPC_CHANNELS.llmConnections.DELETE),
  testLlmConnection: invoke<ElectronAPI['testLlmConnection']>(IPC_CHANNELS.llmConnections.TEST),
  setDefaultLlmConnection: invoke<ElectronAPI['setDefaultLlmConnection']>(IPC_CHANNELS.llmConnections.SET_DEFAULT),
  setWorkspaceDefaultLlmConnection: invoke<ElectronAPI['setWorkspaceDefaultLlmConnection']>(IPC_CHANNELS.llmConnections.SET_WORKSPACE_DEFAULT),

  // Automations
  testAutomation: invoke<ElectronAPI['testAutomation']>(IPC_CHANNELS.automations.TEST),
  setAutomationEnabled: invoke<ElectronAPI['setAutomationEnabled']>(IPC_CHANNELS.automations.SET_ENABLED),
  duplicateAutomation: invoke<ElectronAPI['duplicateAutomation']>(IPC_CHANNELS.automations.DUPLICATE),
  deleteAutomation: invoke<ElectronAPI['deleteAutomation']>(IPC_CHANNELS.automations.DELETE),
  getAutomationHistory: invoke<ElectronAPI['getAutomationHistory']>(IPC_CHANNELS.automations.GET_HISTORY),
  getAutomationLastExecuted: invoke<ElectronAPI['getAutomationLastExecuted']>(IPC_CHANNELS.automations.GET_LAST_EXECUTED),
  onAutomationsChanged: listenOne<Parameters<ElectronAPI['onAutomationsChanged']>[0] extends (data: infer T) => void ? T : never>(IPC_CHANNELS.automations.CHANGED),
}

contextBridge.exposeInMainWorld('electronAPI', api)
