import type { EntityType, Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

interface StatusChange {
  entityType: EntityType;
  entityId: string;
  from: string | null;
  to: string;
  /** null means the change was made by the system (for example the deadline sweeper). */
  actorId: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Writes one status-history row. Always called inside the same transaction as the status
 * change it describes, so history can never disagree with the current state.
 */
export async function recordStatusChange(tx: Tx, change: StatusChange): Promise<void> {
  await tx.statusHistory.create({
    data: {
      entityType: change.entityType,
      entityId: change.entityId,
      fromStatus: change.from,
      toStatus: change.to,
      actorId: change.actorId,
      metadata: change.metadata ?? undefined,
    },
  });
}
