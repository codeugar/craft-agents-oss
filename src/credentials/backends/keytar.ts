/**
 * Keytar Backend
 *
 * Primary cross-platform credential storage using the keytar library.
 * Uses native OS keychains:
 *   - macOS: Keychain Access
 *   - Linux: Secret Service (GNOME Keyring / KWallet)
 *   - Windows: Credential Manager
 */

import type { CredentialBackend } from './types.ts';
import type { CredentialId, StoredCredential } from '../types.ts';
import { credentialIdToAccount, accountToCredentialId } from '../types.ts';

const SERVICE_NAME = 'craft-tui-agent';

export class KeytarBackend implements CredentialBackend {
  readonly name = 'keytar';
  readonly priority = 100;

  private keytar: typeof import('keytar') | null = null;
  private available: boolean | null = null;

  async isAvailable(): Promise<boolean> {
    if (this.available !== null) {
      return this.available;
    }

    try {
      // Dynamic import to handle cases where keytar isn't installed
      this.keytar = await import('keytar');
      // Test that it actually works
      await this.keytar.findCredentials(SERVICE_NAME);
      this.available = true;
    } catch {
      this.available = false;
    }

    return this.available;
  }

  private async getKeytar(): Promise<typeof import('keytar')> {
    if (!this.keytar) {
      this.keytar = await import('keytar');
    }
    return this.keytar;
  }

  async get(id: CredentialId): Promise<StoredCredential | null> {
    const keytar = await this.getKeytar();
    const account = credentialIdToAccount(id);

    const value = await keytar.getPassword(SERVICE_NAME, account);
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as StoredCredential;
    } catch {
      // Handle legacy plain string values
      return { value };
    }
  }

  async set(id: CredentialId, credential: StoredCredential): Promise<void> {
    const keytar = await this.getKeytar();
    const account = credentialIdToAccount(id);

    await keytar.setPassword(SERVICE_NAME, account, JSON.stringify(credential));
  }

  async delete(id: CredentialId): Promise<boolean> {
    const keytar = await this.getKeytar();
    const account = credentialIdToAccount(id);

    return keytar.deletePassword(SERVICE_NAME, account);
  }

  async list(filter?: Partial<CredentialId>): Promise<CredentialId[]> {
    const keytar = await this.getKeytar();
    const credentials = await keytar.findCredentials(SERVICE_NAME);

    // Parse accounts and filter out invalid ones (null)
    const ids = credentials
      .map((c) => accountToCredentialId(c.account))
      .filter((id): id is CredentialId => id !== null);

    if (!filter) {
      return ids;
    }

    return ids.filter((id) => {
      if (filter.type && id.type !== filter.type) return false;
      if (filter.workspaceId && id.workspaceId !== filter.workspaceId) return false;
      if (filter.agentId && id.agentId !== filter.agentId) return false;
      if (filter.name && id.name !== filter.name) return false;
      return true;
    });
  }
}
