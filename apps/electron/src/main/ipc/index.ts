import type { IpcContext } from './types'
import { registerLabelsHandlers } from './labels'
import { registerStatusesHandlers } from './statuses'
import { registerSkillsHandlers } from './skills'
import { registerFilesHandlers } from './files'
import { registerSystemHandlers } from './system'
import { registerAuthHandlers } from './auth'
import { registerSettingsHandlers } from './settings'
import { registerSourcesHandlers } from './sources'
import { registerLlmConnectionsHandlers } from './llm-connections'
import { registerAutomationsHandlers } from './automations'
import { registerWorkspaceHandlers } from './workspace'
import { registerSessionsHandlers } from './sessions'
import { registerBrowserHandlers } from './browser'
import { registerOnboardingHandlers } from '../onboarding'

export function registerAllIpcHandlers(ctx: IpcContext): void {
  registerLabelsHandlers(ctx)
  registerStatusesHandlers(ctx)
  registerSkillsHandlers(ctx)
  registerFilesHandlers(ctx)
  registerSystemHandlers(ctx)
  registerAuthHandlers(ctx)
  registerSettingsHandlers(ctx)
  registerSourcesHandlers(ctx)
  registerLlmConnectionsHandlers(ctx)
  registerAutomationsHandlers(ctx)
  registerWorkspaceHandlers(ctx)
  registerSessionsHandlers(ctx)
  registerBrowserHandlers(ctx)

  // Onboarding handlers (moved from old ipc.ts)
  registerOnboardingHandlers(ctx.sessionManager)
}
