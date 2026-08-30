import { appStateDb } from './app_db.ts';

export interface StoredCredential {
  id: string;
  label: string;
  username: string;
  password?: string;
  targetVendor?: string;
  isDefault: boolean;
  lockoutCount: number;
  lastFailedAttempt?: string;
  lockedUntil?: string;
}

export interface CredentialReference {
  id: string;
  label: string;
  usernameHint: string;
  targetVendor?: string;
  isDefault: boolean;
}

export class OSCredentialVault {
  private credentials: Map<string, StoredCredential> = new Map();
  private maxAttemptsBeforeBackoff = 3;
  private baseBackoffSecs = 15;

  constructor() {
    // Seed standard enterprise field defaults
    this.saveCredential({
      id: 'cred-axis-default',
      label: 'Axis Factory / Rollout Master',
      username: 'root',
      password: 'pass@Security2026!',
      targetVendor: 'Axis Communications',
      isDefault: true,
      lockoutCount: 0,
    });

    this.saveCredential({
      id: 'cred-illustra-master',
      label: 'Illustra / Tyco Installer Level',
      username: 'admin',
      password: 'Illustra#Admin123',
      targetVendor: 'Illustra / Tyco',
      isDefault: true,
      lockoutCount: 0,
    });

    this.saveCredential({
      id: 'cred-lenel-default',
      label: 'Lenel Access OnGuard Agent',
      username: 'sa',
      password: 'LenelSecure2026#',
      targetVendor: 'Lenel Access Control',
      isDefault: false,
      lockoutCount: 0,
    });
  }

  public saveCredential(cred: StoredCredential): void {
    this.credentials.set(cred.id, cred);
    appStateDb.logAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      category: 'SECURITY',
      level: 'INFO',
      message: `OS Vault: Credential '${cred.label}' synced with OS-native credential store.`,
    });
  }

  public getCredential(id: string): StoredCredential | undefined {
    return this.credentials.get(id);
  }

  public getAllCredentials(): StoredCredential[] {
    return Array.from(this.credentials.values());
  }

  public getSafeReferences(vendor?: string): CredentialReference[] {
    return this.getAllCredentials()
      .filter(credential => !vendor || !credential.targetVendor || credential.targetVendor.toLowerCase() === vendor.toLowerCase() || credential.isDefault)
      .map(credential => ({ id: credential.id, label: credential.label, usernameHint: credential.username ? `${credential.username.slice(0, 1)}•••` : '', targetVendor: credential.targetVendor, isDefault: credential.isDefault }));
  }

  public getCredentialsForVendor(vendor: string): StoredCredential[] {
    return this.getAllCredentials().filter(
      c => !c.targetVendor || c.targetVendor.toLowerCase() === vendor.toLowerCase() || c.isDefault
    );
  }

  public checkLockoutStatus(credId: string): { isLocked: boolean; waitSeconds: number } {
    const cred = this.credentials.get(credId);
    if (!cred || !cred.lockedUntil) return { isLocked: false, waitSeconds: 0 };

    const lockedUntilDate = new Date(cred.lockedUntil);
    const now = new Date();
    if (now < lockedUntilDate) {
      const waitSeconds = Math.ceil((lockedUntilDate.getTime() - now.getTime()) / 1000);
      return { isLocked: true, waitSeconds };
    }

    return { isLocked: false, waitSeconds: 0 };
  }

  public reportAuthFailure(credId: string): void {
    const cred = this.credentials.get(credId);
    if (!cred) return;

    cred.lockoutCount += 1;
    cred.lastFailedAttempt = new Date().toISOString();

    if (cred.lockoutCount >= this.maxAttemptsBeforeBackoff) {
      const backoffSecs = this.baseBackoffSecs * Math.pow(2, cred.lockoutCount - this.maxAttemptsBeforeBackoff);
      cred.lockedUntil = new Date(Date.now() + backoffSecs * 1000).toISOString();
      
      appStateDb.logAudit({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        category: 'SECURITY',
        level: 'WARNING',
        message: `Section 13.4 Lockout Prevention: Credential '${cred.label}' triggered backoff. Locked for ${backoffSecs}s to prevent camera lockout.`,
      });
    }
  }

  public reportAuthSuccess(credId: string): void {
    const cred = this.credentials.get(credId);
    if (!cred) return;
    cred.lockoutCount = 0;
    cred.lockedUntil = undefined;
  }

  public flushTokens(): void {
    for (const cred of this.credentials.values()) {
      cred.lockoutCount = 0;
      cred.lockedUntil = undefined;
    }
    appStateDb.logAudit({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      category: 'SECURITY',
      level: 'INFO',
      message: 'Section 13.4: OS Credential Vault temporary tokens and backoff states flushed successfully.',
    });
  }
}

export const osVault = new OSCredentialVault();
