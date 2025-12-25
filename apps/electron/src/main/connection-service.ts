/**
 * ConnectionService - Builds MCP and API server configs from connections
 *
 * Similar to SubAgentManager but for user-defined connections.
 * Handles credential lookup and server config building.
 */

import { createApiServer } from '@craft-agent/shared/agents/api-tools'
import { createGmailServer } from '@craft-agent/shared/agents/gmail-tools'
import { getCredentialManager } from '@craft-agent/shared/credentials'
import type { ApiConfig } from '@craft-agent/shared/agents/types'
import type { ConnectionConfig } from '../shared/types'

// Type for MCP server config (matches SDK expectations)
export type McpServerConfig = {
  type: 'http' | 'sse'
  url: string
  headers?: Record<string, string>
}

// Type for API server (in-process MCP server)
export type ApiServer = ReturnType<typeof createApiServer>

// Type for Gmail server (in-process MCP server)
export type GmailServer = ReturnType<typeof createGmailServer>

export class ConnectionService {
  /**
   * Build MCP server config from connection (with auth headers)
   */
  async buildMcpServerConfig(connection: ConnectionConfig): Promise<McpServerConfig> {
    if (connection.type !== 'mcp') {
      throw new Error(`Not an MCP connection: ${connection.name}`)
    }

    if (!connection.mcpUrl) {
      throw new Error(`MCP connection ${connection.name} missing URL`)
    }

    const config: McpServerConfig = {
      type: connection.mcpUrl.includes('/sse') ? 'sse' : 'http',
      url: connection.mcpUrl,
    }

    // Retrieve OAuth token from CredentialManager
    if (connection.isAuthenticated) {
      try {
        const manager = getCredentialManager()
        const creds = await manager.get({ type: 'connection_oauth', connectionId: connection.id })
        if (creds?.value) {
          config.headers = {
            Authorization: `Bearer ${creds.value}`,
          }
          console.log(`[ConnectionService] Added auth header for MCP connection: ${connection.name}`)
        } else {
          console.warn(`[ConnectionService] No stored token for authenticated connection: ${connection.name}`)
        }
      } catch (error) {
        console.error(`[ConnectionService] Failed to get credentials for ${connection.name}:`, error)
      }
    }

    return config
  }

  /**
   * Build API server from connection
   */
  buildApiServer(connection: ConnectionConfig): ApiServer {
    if (connection.type !== 'api') {
      throw new Error(`Not an API connection: ${connection.name}`)
    }

    if (!connection.apiUrl) {
      throw new Error(`API connection ${connection.name} missing URL`)
    }

    const apiConfig: ApiConfig = {
      name: connection.name,
      baseUrl: connection.apiUrl,
      auth: { type: 'bearer' },
      documentation: '', // User can add documentation later
    }

    // Use the stored bearer token
    const credential = connection.apiBearerToken || ''

    return createApiServer(apiConfig, credential)
  }

  /**
   * Build Gmail server from connection
   */
  async buildGmailServer(connection: ConnectionConfig): Promise<GmailServer | null> {
    if (connection.type !== 'gmail') {
      throw new Error(`Not a Gmail connection: ${connection.name}`)
    }

    // Retrieve OAuth token from CredentialManager
    try {
      const manager = getCredentialManager()
      const creds = await manager.get({ type: 'gmail_oauth', connectionId: connection.id })
      if (creds?.value) {
        console.log(`[ConnectionService] Creating Gmail server for connection: ${connection.name}`)
        return createGmailServer(creds.value)
      } else {
        console.warn(`[ConnectionService] No stored token for Gmail connection: ${connection.name}`)
        return null
      }
    } catch (error) {
      console.error(`[ConnectionService] Failed to get Gmail credentials for ${connection.name}:`, error)
      return null
    }
  }

  /**
   * Build all server configs for selected connections
   */
  async buildServerConfigs(connections: ConnectionConfig[]): Promise<{
    mcpServers: Record<string, McpServerConfig>
    apiServers: Record<string, ApiServer | GmailServer>
  }> {
    const mcpServers: Record<string, McpServerConfig> = {}
    const apiServers: Record<string, ApiServer | GmailServer> = {}

    for (const conn of connections) {
      if (!conn.enabled) continue

      try {
        if (conn.type === 'mcp') {
          mcpServers[conn.name] = await this.buildMcpServerConfig(conn)
        } else if (conn.type === 'api') {
          apiServers[`api_${conn.name}`] = this.buildApiServer(conn)
        } else if (conn.type === 'gmail') {
          const gmailServer = await this.buildGmailServer(conn)
          if (gmailServer) {
            apiServers[`gmail_${conn.id}`] = gmailServer
          }
        }
      } catch (error) {
        console.error(`[ConnectionService] Failed to build config for ${conn.name}:`, error)
        // Skip this connection but continue with others
      }
    }

    return { mcpServers, apiServers }
  }
}

// Singleton instance
let connectionServiceInstance: ConnectionService | null = null

export function getConnectionService(): ConnectionService {
  if (!connectionServiceInstance) {
    connectionServiceInstance = new ConnectionService()
  }
  return connectionServiceInstance
}
