import { prisma } from '../db.js';
import { now } from '../clock.js';
import { recordStatusChange } from './history.js';

/**
 * Moves every PUBLISHED RFQ whose deadline has passed to CLOSED.
 *
 * Runs in three situations: before any request that depends on RFQ state, on a background
 * interval (see server.ts), and in tests with a pinned clock. Each RFQ is closed in its own
 * transaction using a conditional UPDATE, so running it concurrently is safe: whichever
 * caller wins the update writes the history row, and the other caller changes nothing.
 *
 * Boundary rule (matches submission rules): an RFQ is open while now < deadline and closed
 * once now >= deadline.
 */
export async function closeExpiredRfqs(): Promise<number> {
  const at = now();
  const expired = await prisma.rfq.findMany({
    where: { status: 'PUBLISHED', deadline: { lte: at } },
    select: { id: true },
  });

  let closed = 0;
  for (const { id } of expired) {
    const didClose = await prisma.$transaction(async (tx) => {
      const result = await tx.rfq.updateMany({
        where: { id, status: 'PUBLISHED', deadline: { lte: at } },
        data: { status: 'CLOSED' },
      });
      if (result.count !== 1) return false;
      await recordStatusChange(tx, {
        entityType: 'RFQ',
        entityId: id,
        from: 'PUBLISHED',
        to: 'CLOSED',
        actorId: null,
        metadata: { reason: 'deadline_passed' },
      });
      return true;
    });
    if (didClose) closed += 1;
  }
  return closed;
}
