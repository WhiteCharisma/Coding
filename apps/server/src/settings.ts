import { eq } from 'drizzle-orm';
import type { AdminSettingsInput, RegistrationMode } from '@creator-network/shared';
import type { AppConfig } from './config';
import type { DB } from './db/client';
import { appSettings } from './db/schema';

export interface InstanceSettings {
  registrationMode: RegistrationMode;
  requireEmailVerification: boolean;
  maxUploadMb: number;
  communityCreation: 'everyone' | 'admins';
  appealContact: string;
  instanceName: string;
  welcomeMessage: string;
}

/** Instance-wide settings editable by administrators. Cached in memory; single process. */
export class SettingsStore {
  private cache: InstanceSettings;

  constructor(
    private readonly db: DB,
    private readonly config: AppConfig,
  ) {
    this.cache = this.load();
  }

  private defaults(): InstanceSettings {
    return {
      registrationMode: 'open',
      requireEmailVerification: false,
      maxUploadMb: Math.min(25, this.config.maxUploadMbHardLimit),
      communityCreation: 'everyone',
      appealContact: '',
      instanceName: this.config.appName,
      welcomeMessage: 'A home for producers, artists, labels, game makers and every creative in between.',
    };
  }

  private load(): InstanceSettings {
    const values = { ...this.defaults() } as Record<string, unknown>;
    for (const row of this.db.select().from(appSettings).all()) values[row.key] = row.value;
    const s = values as unknown as InstanceSettings;
    s.maxUploadMb = Math.min(s.maxUploadMb, this.config.maxUploadMbHardLimit);
    return s;
  }

  get(): InstanceSettings {
    return this.cache;
  }

  update(patch: AdminSettingsInput, actorId: string | null): InstanceSettings {
    const now = Date.now();
    this.db.transaction((tx) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        const existing = tx.select().from(appSettings).where(eq(appSettings.key, key)).get();
        if (existing) {
          tx.update(appSettings)
            .set({ value, updatedAt: now, updatedBy: actorId })
            .where(eq(appSettings.key, key))
            .run();
        } else {
          tx.insert(appSettings).values({ key, value, updatedAt: now, updatedBy: actorId }).run();
        }
      }
    });
    this.cache = this.load();
    return this.cache;
  }
}
