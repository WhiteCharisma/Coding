import type { DbOrTx } from './db/client';
import { newId } from './db/ids';
import { auditEvents } from './db/schema';

export interface AuditInput {
  scope: 'platform' | 'community';
  communityId?: string | null;
  actorId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Records an administrative or moderation action (who, what, target, when).
 * Never pass message content or secrets in metadata.
 */
export function audit(db: DbOrTx, input: AuditInput): void {
  db.insert(auditEvents)
    .values({
      id: newId(),
      scope: input.scope,
      communityId: input.communityId ?? null,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      targetLabel: input.targetLabel ?? null,
      reason: input.reason || null,
      metadata: input.metadata ?? {},
      createdAt: Date.now(),
    })
    .run();
}
