// Capture errors in the isolated preload context and forward to Sentry
import '@sentry/electron/preload'
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type ElectronAPI } from '../shared/types'
import { invoke, send, listen, listenVoid } from './helpers'

const api: ElectronAPI = {
  // Session management
  getSessions: invoke(IPC_CHANNELS.GET_SESSIONS),
  getUnreadSummary: invoke(IPC_CHANNELS.GET_UNREAD_SUMMARY),
  markAllSessionsRead: invoke(IPC_CHANNELS.MARK_ALL_SESSIONS_READ),
  getSessionMessages: invoke(IPC_CHANNELS.GET_SESSION_MESSAGES),
  createSession: invoke(IPC_CHANNELS.CREATE_SESSION),
  deleteSession: invoke(IPC_CHANNELS.DELETE_SESSION),
  sendMessage: invoke(IPC_CHANNELS.SEND_MESSAGE),
  cancelProcessing: invoke(IPC_CHANNELS.CANCEL_PROCESSING),
  killShell: invoke(IPC_CHANNELS.KILL_SHELL),
  getTaskOutput: invoke(IPC_CHANNELS.GET_TASK_OUTPUT),
  respondToPermission: invoke(IPC_CHANNELS.RESPOND_TO_PERMISSION),
  respondToCredential: invoke(IPC_CHANNELS.RESPOND_TO_CREDENTIAL),
  sessionCommand: invoke(IPC_CHANNELS.SESSION_COMMAND),
  getPendingPlanExecution: invoke(IPC_CHANNELS.GET_PENDING_PLAN_EXECUTION),
  getSessionPermissionModeState: invoke(IPC_CHANNELS.GET_SESSION_PERMISSION_MODE_STATE),

  // Workspace management
  getWorkspaces: invoke(IPC_CHANNELS.GET_WORKSPACES),
  createWorkspace: invoke(IPC_CHANNELS.CREATE_WORKSPACE),
  checkWorkspaceSlug: invoke(IPC_CHANNELS.CHECK_WORKSPACE_SLUG),

  // Window management
  getWindowWorkspace: invoke(IPC_CHANNELS.GET_WINDOW_WORKSPACE),
  getWindowMode: invoke(IPC_CHANNELS.GET_WINDOW_MODE),
  openWorkspace: invoke(IPC_CHANNELS.OPEN_WORKSPACE),
  openSessionInNewWindow: invoke(IPC_CHANNELS.OPEN_SESSION_IN_NEW_WINDOW),
  switchWorkspace: invoke(IPC_CHANNELS.SWITCH_WORKSPACE),
  closeWindow: invoke(IPC_CHANNELS.CLOSE_WINDOW),
  confirmCloseWindow: invoke(IPC_CHANNELS.WINDOW_CONFIRM_CLOSE),
  cancelCloseWindow: invoke(IPC_CHANNELS.WINDOW_CANCEL_CLOSE),
  onCloseRequested: listenVoid(IPC_CHANNELS.WINDOW_CLOSE_REQUESTED),
  setTrafficLightsVisible: invoke(IPC_CHANNELS.WINDOW_SET_TRAFFIC_LIGHTS),

  // Event listeners
  onSessionEvent: listen(IPC_CHANNELS.SESSION_EVENT),
  onUnreadSummaryChanged: listen(IPC_CHANNELS.SESSIONS_UNREAD_SUMMARY_CHANGED),

  // File operations
  readFile: invoke(IPC_CHANNELS.READ_FILE),
  readFileDataUrl: invoke(IPC_CHANNELS.READ_FILE_DATA_URL),
  readFileBinary: invoke(IPC_CHANNELS.READ_FILE_BINARY),
  openFileDialog: invoke(IPC_CHANNELS.OPEN_FILE_DIALOG),
  readFileAttachment: invoke(IPC_CHANNELS.READ_FILE_ATTACHMENT),
  storeAttachment: invoke(IPC_CHANNELS.STORE_ATTACHMENT),
  generateThumbnail: invoke(IPC_CHANNELS.GENERATE_THUMBNAIL),

  // Theme
  getSystemTheme: invoke(IPC_CHANNELS.GET_SYSTEM_THEME),
  onSystemThemeChange: listen(IPC_CHANNELS.SYSTEM_THEME_CHANGED),

  // System
  getVersions: () => ({
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  }),
  getHomeDir: invoke(IPC_CHANNELS.GET_HOME_DIR),
  isDebugMode: invoke(IPC_CHANNELS.IS_DEBUG_MODE),

  // Auto-update
  checkForUpdates: invoke(IPC_CHANNELS.UPDATE_CHECK),
  getUpdateInfo: invoke(IPC_CHANNELS.UPDATE_GET_INFO),
  installUpdate: invoke(IPC_CHANNELS.UPDATE_INSTALL),
  dismissUpdate: invoke(IPC_CHANNELS.UPDATE_DISMISS),
  getDismissedUpdateVersion: invoke(IPC_CHANNELS.UPDATE_GET_DISMISSED),
  onUpdateAvailable: listen(IPC_CHANNELS.UPDATE_AVAILABLE),
  onUpdateDownloadProgress: listen(IPC_CHANNELS.UPDATE_DOWNLOAD_PROGRESS),

  // Release notes
  getReleaseNotes: invoke(IPC_CHANNELS.GET_RELEASE_NOTES),
  getLatestReleaseVersion: invoke(IPC_CHANNELS.GET_LATEST_RELEASE_VERSION),

  // Shell operations
  openUrl: invoke(IPC_CHANNELS.OPEN_URL),
  openFile: invoke(IPC_CHANNELS.OPEN_FILE),
  showInFolder: invoke(IPC_CHANNELS.SHOW_IN_FOLDER),

  // Menu event listeners
  onMenuNewChat: listenVoid(IPC_CHANNELS.MENU_NEW_CHAT),
  onMenuOpenSettings: listenVoid(IPC_CHANNELS.MENU_OPEN_SETTINGS),
  onMenuKeyboardShortcuts: listenVoid(IPC_CHANNELS.MENU_KEYBOARD_SHORTCUTS),
  onMenuToggleFocusMode: listenVoid(IPC_CHANNELS.MENU_TOGGLE_FOCUS_MODE),
  onMenuToggleSidebar: listenVoid(IPC_CHANNELS.MENU_TOGGLE_SIDEBAR),

  // Deep link navigation
  onDeepLinkNavigate: listen(IPC_CHANNELS.DEEP_LINK_NAVIGATE),

  // Auth
  showLogoutConfirmation: invoke(IPC_CHANNELS.SHOW_LOGOUT_CONFIRMATION),
  showDeleteSessionConfirmation: invoke(IPC_CHANNELS.SHOW_DELETE_SESSION_CONFIRMATION),
  logout: invoke(IPC_CHANNELS.LOGOUT),
  getCredentialHealth: invoke(IPC_CHANNELS.CREDENTIAL_HEALTH_CHECK),

  // Onboarding
  getAuthState: () => ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_GET_AUTH_STATE).then(r => r.authState),
  getSetupNeeds: () => ipcRenderer.invoke(IPC_CHANNELS.ONBOARDING_GET_AUTH_STATE).then(r => r.setupNeeds),
  startWorkspaceMcpOAuth: invoke(IPC_CHANNELS.ONBOARDING_START_MCP_OAUTH),
  startClaudeOAuth: invoke(IPC_CHANNELS.ONBOARDING_START_CLAUDE_OAUTH),
  exchangeClaudeCode: invoke(IPC_CHANNELS.ONBOARDING_EXCHANGE_CLAUDE_CODE),
  hasClaudeOAuthState: invoke(IPC_CHANNELS.ONBOARDING_HAS_CLAUDE_OAUTH_STATE),
  clearClaudeOAuthState: invoke(IPC_CHANNELS.ONBOARDING_CLEAR_CLAUDE_OAUTH_STATE),

  // ChatGPT OAuth
  startChatGptOAuth: invoke(IPC_CHANNELS.CHATGPT_START_OAUTH),
  cancelChatGptOAuth: invoke(IPC_CHANNELS.CHATGPT_CANCEL_OAUTH),
  getChatGptAuthStatus: invoke(IPC_CHANNELS.CHATGPT_GET_AUTH_STATUS),
  chatGptLogout: invoke(IPC_CHANNELS.CHATGPT_LOGOUT),

  // GitHub Copilot OAuth
  startCopilotOAuth: invoke(IPC_CHANNELS.COPILOT_START_OAUTH),
  cancelCopilotOAuth: invoke(IPC_CHANNELS.COPILOT_CANCEL_OAUTH),
  getCopilotAuthStatus: invoke(IPC_CHANNELS.COPILOT_GET_AUTH_STATUS),
  copilotLogout: invoke(IPC_CHANNELS.COPILOT_LOGOUT),
  onCopilotDeviceCode: listen(IPC_CHANNELS.COPILOT_DEVICE_CODE),

  // Settings - API Setup
  setupLlmConnection: invoke(IPC_CHANNELS.SETUP_LLM_CONNECTION),
  testLlmConnectionSetup: invoke(IPC_CHANNELS.SETTINGS_TEST_LLM_CONNECTION_SETUP),

  // Pi provider discovery
  getPiApiKeyProviders: invoke(IPC_CHANNELS.PI_GET_API_KEY_PROVIDERS),
  getPiProviderBaseUrl: invoke(IPC_CHANNELS.PI_GET_PROVIDER_BASE_URL),
  getPiProviderModels: invoke(IPC_CHANNELS.PI_GET_PROVIDER_MODELS),

  // Session-specific model
  getSessionModel: invoke(IPC_CHANNELS.SESSION_GET_MODEL),
  setSessionModel: invoke(IPC_CHANNELS.SESSION_SET_MODEL),

  // Workspace Settings
  getWorkspaceSettings: invoke(IPC_CHANNELS.WORKSPACE_SETTINGS_GET),
  updateWorkspaceSetting: invoke(IPC_CHANNELS.WORKSPACE_SETTINGS_UPDATE),

  // Folder dialog
  openFolderDialog: invoke(IPC_CHANNELS.OPEN_FOLDER_DIALOG),

  // Filesystem search
  searchFiles: invoke(IPC_CHANNELS.FS_SEARCH),

  // Debug logging (fire-and-forget)
  debugLog: send(IPC_CHANNELS.DEBUG_LOG),

  // User Preferences
  readPreferences: invoke(IPC_CHANNELS.PREFERENCES_READ),
  writePreferences: invoke(IPC_CHANNELS.PREFERENCES_WRITE),

  // Session Drafts
  getDraft: invoke(IPC_CHANNELS.DRAFTS_GET),
  setDraft: invoke(IPC_CHANNELS.DRAFTS_SET),
  deleteDraft: invoke(IPC_CHANNELS.DRAFTS_DELETE),
  getAllDrafts: invoke(IPC_CHANNELS.DRAFTS_GET_ALL),

  // Session Info Panel
  getSessionFiles: invoke(IPC_CHANNELS.GET_SESSION_FILES),
  getSessionNotes: invoke(IPC_CHANNELS.GET_SESSION_NOTES),
  setSessionNotes: invoke(IPC_CHANNELS.SET_SESSION_NOTES),
  watchSessionFiles: invoke(IPC_CHANNELS.WATCH_SESSION_FILES),
  unwatchSessionFiles: invoke(IPC_CHANNELS.UNWATCH_SESSION_FILES),
  onSessionFilesChanged: listen(IPC_CHANNELS.SESSION_FILES_CHANGED),

  // Sources
  getSources: invoke(IPC_CHANNELS.SOURCES_GET),
  createSource: invoke(IPC_CHANNELS.SOURCES_CREATE),
  deleteSource: invoke(IPC_CHANNELS.SOURCES_DELETE),
  startSourceOAuth: invoke(IPC_CHANNELS.SOURCES_START_OAUTH),
  saveSourceCredentials: invoke(IPC_CHANNELS.SOURCES_SAVE_CREDENTIALS),
  getSourcePermissionsConfig: invoke(IPC_CHANNELS.SOURCES_GET_PERMISSIONS),
  getWorkspacePermissionsConfig: invoke(IPC_CHANNELS.WORKSPACE_GET_PERMISSIONS),
  getDefaultPermissionsConfig: invoke(IPC_CHANNELS.DEFAULT_PERMISSIONS_GET),
  onDefaultPermissionsChanged: listenVoid(IPC_CHANNELS.DEFAULT_PERMISSIONS_CHANGED),
  getMcpTools: invoke(IPC_CHANNELS.SOURCES_GET_MCP_TOOLS),

  // Session content search
  searchSessionContent: invoke(IPC_CHANNELS.SEARCH_SESSIONS),

  // Statuses
  listStatuses: invoke(IPC_CHANNELS.STATUSES_LIST),
  reorderStatuses: invoke(IPC_CHANNELS.STATUSES_REORDER),

  // Workspace images
  readWorkspaceImage: invoke(IPC_CHANNELS.WORKSPACE_READ_IMAGE),
  writeWorkspaceImage: invoke(IPC_CHANNELS.WORKSPACE_WRITE_IMAGE),

  // Sources change listener
  onSourcesChanged: listen(IPC_CHANNELS.SOURCES_CHANGED),

  // Skills
  getSkills: invoke(IPC_CHANNELS.SKILLS_GET),
  getSkillFiles: invoke(IPC_CHANNELS.SKILLS_GET_FILES),
  deleteSkill: invoke(IPC_CHANNELS.SKILLS_DELETE),
  openSkillInEditor: invoke(IPC_CHANNELS.SKILLS_OPEN_EDITOR),
  openSkillInFinder: invoke(IPC_CHANNELS.SKILLS_OPEN_FINDER),
  onSkillsChanged: listen(IPC_CHANNELS.SKILLS_CHANGED),

  // Statuses change listener
  onStatusesChanged: listen(IPC_CHANNELS.STATUSES_CHANGED),

  // Labels
  listLabels: invoke(IPC_CHANNELS.LABELS_LIST),
  createLabel: invoke(IPC_CHANNELS.LABELS_CREATE),
  deleteLabel: invoke(IPC_CHANNELS.LABELS_DELETE),
  onLabelsChanged: listen(IPC_CHANNELS.LABELS_CHANGED),

  // LLM connections change listener
  onLlmConnectionsChanged: listenVoid(IPC_CHANNELS.LLM_CONNECTIONS_CHANGED),

  // Views
  listViews: invoke(IPC_CHANNELS.VIEWS_LIST),
  saveViews: invoke(IPC_CHANNELS.VIEWS_SAVE),

  // Tool icon mappings
  getToolIconMappings: invoke(IPC_CHANNELS.TOOL_ICONS_GET_MAPPINGS),

  // Theme
  getAppTheme: invoke(IPC_CHANNELS.THEME_GET_APP),
  loadPresetThemes: invoke(IPC_CHANNELS.THEME_GET_PRESETS),
  loadPresetTheme: invoke(IPC_CHANNELS.THEME_LOAD_PRESET),
  getColorTheme: invoke(IPC_CHANNELS.THEME_GET_COLOR_THEME),
  setColorTheme: invoke(IPC_CHANNELS.THEME_SET_COLOR_THEME),
  getWorkspaceColorTheme: invoke(IPC_CHANNELS.THEME_GET_WORKSPACE_COLOR_THEME),
  setWorkspaceColorTheme: invoke(IPC_CHANNELS.THEME_SET_WORKSPACE_COLOR_THEME),
  getAllWorkspaceThemes: invoke(IPC_CHANNELS.THEME_GET_ALL_WORKSPACE_THEMES),
  getLogoUrl: invoke(IPC_CHANNELS.LOGO_GET_URL),
  onAppThemeChange: listen(IPC_CHANNELS.THEME_APP_CHANGED),
  broadcastThemePreferences: invoke(IPC_CHANNELS.THEME_BROADCAST_PREFERENCES),
  onThemePreferencesChange: listen(IPC_CHANNELS.THEME_PREFERENCES_CHANGED),
  broadcastWorkspaceThemeChange: invoke(IPC_CHANNELS.THEME_BROADCAST_WORKSPACE_THEME),
  onWorkspaceThemeChange: listen(IPC_CHANNELS.THEME_WORKSPACE_THEME_CHANGED),

  // Notifications
  showNotification: invoke(IPC_CHANNELS.NOTIFICATION_SHOW),
  getNotificationsEnabled: invoke(IPC_CHANNELS.NOTIFICATION_GET_ENABLED),
  setNotificationsEnabled: invoke(IPC_CHANNELS.NOTIFICATION_SET_ENABLED),

  // Input settings
  getAutoCapitalisation: invoke(IPC_CHANNELS.INPUT_GET_AUTO_CAPITALISATION),
  setAutoCapitalisation: invoke(IPC_CHANNELS.INPUT_SET_AUTO_CAPITALISATION),
  getSendMessageKey: invoke(IPC_CHANNELS.INPUT_GET_SEND_MESSAGE_KEY),
  setSendMessageKey: invoke(IPC_CHANNELS.INPUT_SET_SEND_MESSAGE_KEY),
  getSpellCheck: invoke(IPC_CHANNELS.INPUT_GET_SPELL_CHECK),
  setSpellCheck: invoke(IPC_CHANNELS.INPUT_SET_SPELL_CHECK),

  // Power settings
  getKeepAwakeWhileRunning: invoke(IPC_CHANNELS.POWER_GET_KEEP_AWAKE),
  setKeepAwakeWhileRunning: invoke(IPC_CHANNELS.POWER_SET_KEEP_AWAKE),

  // Appearance settings
  getRichToolDescriptions: invoke(IPC_CHANNELS.APPEARANCE_GET_RICH_TOOL_DESCRIPTIONS),
  setRichToolDescriptions: invoke(IPC_CHANNELS.APPEARANCE_SET_RICH_TOOL_DESCRIPTIONS),

  // Badge
  refreshBadge: invoke(IPC_CHANNELS.BADGE_REFRESH),
  setDockIconWithBadge: invoke(IPC_CHANNELS.BADGE_SET_ICON),
  onBadgeDraw: listen(IPC_CHANNELS.BADGE_DRAW),
  onBadgeDrawWindows: listen(IPC_CHANNELS.BADGE_DRAW_WINDOWS),

  // Window focus
  getWindowFocusState: invoke(IPC_CHANNELS.WINDOW_GET_FOCUS_STATE),
  onWindowFocusChange: listen(IPC_CHANNELS.WINDOW_FOCUS_STATE),
  onNotificationNavigate: listen(IPC_CHANNELS.NOTIFICATION_NAVIGATE),

  // Git
  getGitBranch: invoke(IPC_CHANNELS.GET_GIT_BRANCH),
  checkGitBash: invoke(IPC_CHANNELS.GITBASH_CHECK),
  browseForGitBash: invoke(IPC_CHANNELS.GITBASH_BROWSE),
  setGitBashPath: invoke(IPC_CHANNELS.GITBASH_SET_PATH),

  // Menu actions
  menuQuit: invoke(IPC_CHANNELS.MENU_QUIT),
  menuNewWindow: invoke(IPC_CHANNELS.MENU_NEW_WINDOW),
  menuMinimize: invoke(IPC_CHANNELS.MENU_MINIMIZE),
  menuMaximize: invoke(IPC_CHANNELS.MENU_MAXIMIZE),
  menuZoomIn: invoke(IPC_CHANNELS.MENU_ZOOM_IN),
  menuZoomOut: invoke(IPC_CHANNELS.MENU_ZOOM_OUT),
  menuZoomReset: invoke(IPC_CHANNELS.MENU_ZOOM_RESET),
  menuToggleDevTools: invoke(IPC_CHANNELS.MENU_TOGGLE_DEVTOOLS),
  menuUndo: invoke(IPC_CHANNELS.MENU_UNDO),
  menuRedo: invoke(IPC_CHANNELS.MENU_REDO),
  menuCut: invoke(IPC_CHANNELS.MENU_CUT),
  menuCopy: invoke(IPC_CHANNELS.MENU_COPY),
  menuPaste: invoke(IPC_CHANNELS.MENU_PASTE),
  menuSelectAll: invoke(IPC_CHANNELS.MENU_SELECT_ALL),

  // Browser pane management
  browserPane: {
    create: invoke(IPC_CHANNELS.BROWSER_PANE_CREATE),
    destroy: invoke(IPC_CHANNELS.BROWSER_PANE_DESTROY),
    list: invoke(IPC_CHANNELS.BROWSER_PANE_LIST),
    navigate: invoke(IPC_CHANNELS.BROWSER_PANE_NAVIGATE),
    goBack: invoke(IPC_CHANNELS.BROWSER_PANE_GO_BACK),
    goForward: invoke(IPC_CHANNELS.BROWSER_PANE_GO_FORWARD),
    reload: invoke(IPC_CHANNELS.BROWSER_PANE_RELOAD),
    stop: invoke(IPC_CHANNELS.BROWSER_PANE_STOP),
    focus: invoke(IPC_CHANNELS.BROWSER_PANE_FOCUS),
    emptyStateLaunch: invoke(IPC_CHANNELS.BROWSER_EMPTY_STATE_LAUNCH),
    onStateChanged: listen(IPC_CHANNELS.BROWSER_PANE_STATE_CHANGED),
    onRemoved: listen(IPC_CHANNELS.BROWSER_PANE_REMOVED),
    onInteracted: listen(IPC_CHANNELS.BROWSER_PANE_INTERACTED),
  },

  // LLM Connections
  listLlmConnections: invoke(IPC_CHANNELS.LLM_CONNECTION_LIST),
  listLlmConnectionsWithStatus: invoke(IPC_CHANNELS.LLM_CONNECTION_LIST_WITH_STATUS),
  getLlmConnection: invoke(IPC_CHANNELS.LLM_CONNECTION_GET),
  getLlmConnectionApiKey: invoke(IPC_CHANNELS.LLM_CONNECTION_GET_API_KEY),
  saveLlmConnection: invoke(IPC_CHANNELS.LLM_CONNECTION_SAVE),
  deleteLlmConnection: invoke(IPC_CHANNELS.LLM_CONNECTION_DELETE),
  testLlmConnection: invoke(IPC_CHANNELS.LLM_CONNECTION_TEST),
  setDefaultLlmConnection: invoke(IPC_CHANNELS.LLM_CONNECTION_SET_DEFAULT),
  setWorkspaceDefaultLlmConnection: invoke(IPC_CHANNELS.LLM_CONNECTION_SET_WORKSPACE_DEFAULT),

  // Automations
  testAutomation: invoke(IPC_CHANNELS.TEST_AUTOMATION),
  setAutomationEnabled: invoke(IPC_CHANNELS.AUTOMATIONS_SET_ENABLED),
  duplicateAutomation: invoke(IPC_CHANNELS.AUTOMATIONS_DUPLICATE),
  deleteAutomation: invoke(IPC_CHANNELS.AUTOMATIONS_DELETE),
  getAutomationHistory: invoke(IPC_CHANNELS.AUTOMATIONS_GET_HISTORY),
  getAutomationLastExecuted: invoke(IPC_CHANNELS.AUTOMATIONS_GET_LAST_EXECUTED),
  onAutomationsChanged: listen(IPC_CHANNELS.AUTOMATIONS_CHANGED),
}

contextBridge.exposeInMainWorld('electronAPI', api)
