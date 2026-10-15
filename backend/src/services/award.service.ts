import { prisma } from '../db.js';
import { now } from '../clock.js';
import { conflict, notFound, unprocessable } from '../errors.js';
import type { AuthUser } from '../types/express.js';
import { closeExpiredRfqs } from './closure.js';
import { recordStatusChange } from './history.js';
import { serializeRfq } from './serializers.js';

/**
 * Awards one quotation. Everything happens in one transaction:
 *   1. Only the owning buyer may award, and the RFQ must be CLOSED.
 *   2. The selected quote must belong to this RFQ and still be SUBMITTED or SHORTLISTED.
 *   3. The RFQ moves CLOSED -> AWARDED through a conditional UPDATE. This is the concurrency guard:
 *      if two awards race, InnoDB serializes them and only one UPDATE matches the CLOSED row.
 *      The loser gets a 409 and its transaction rolls back, so no partial award is committed.
 *   4. The winner becomes ACCEPTED. Every other non-rejected quote becomes REJECTED.
 *   5. A status-history row is written for each change, in the same transaction.
 */
export async function awardQuote(actor: AuthUser, rfqId: string, quoteId: string) {
  await closeExpiredRfqs();

  const result = await prisma.$transaction(async (tx) => {
    const rfq = await tx.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq || rfq.buyerId !== actor.id) throw notFound('RFQ not found');
    if (rfq.status === 'AWARDED') {
      throw conflict('RFQ_ALREADY_AWARDED', 'This RFQ has already been awarded');
    }
    if (rfq.status !== 'CLOSED') {
      throw conflict('RFQ_NOT_CLOSED', 'An RFQ can be awarded only after its deadline has passed and it is closed');
    }

    const winner = await tx.quote.findUnique({
      where: { id: quoteId },
      select: { id: true, rfqId: true, vendorId: true, status: true },
    });
    if (!winner) throw notFound('Quotation not found');
    if (winner.rfqId !== rfqId) {
      throw unprocessable('QUOTE_NOT_IN_RFQ', 'The selected quotation does not belong to this RFQ');
    }
    if (winner.status !== 'SUBMITTED' && winner.status !== 'SHORTLISTED') {
      throw conflict('QUOTE_NOT_ELIGIBLE', `A quotation with status ${winner.status} cannot be awarded`);
    }

    // Concurrency guard. Only one transaction can move this RFQ from CLOSED to AWARDED.
    const guard = await tx.rfq.updateMany({
      where: { id: rfqId, status: 'CLOSED' },
      data: {
        status: 'AWARDED',
        awardedAt: now(),
        awardedById: actor.id,
        awardedQuoteId: quoteId,
      },
    });
    if (guard.count !== 1) {
      throw conflict('RFQ_ALREADY_AWARDED', 'Another award was completed for this RFQ');
    }

    await recordStatusChange(tx, {
      entityType: 'RFQ',
      entityId: rfqId,
      from: 'CLOSED',
      to: 'AWARDED',
      actorId: actor.id,
      metadata: { awardedQuoteId: quoteId, awardedVendorId: winner.vendorId },
    });

    const others = await tx.quote.findMany({
      where: { rfqId, id: { not: quoteId }, status: { not: 'REJECTED' } },
      select: { id: true, status: true },
    });

    await tx.quote.update({ where: { id: quoteId }, data: { status: 'ACCEPTED' } });
    await recordStatusChange(tx, {
      entityType: 'QUOTE',
      entityId: quoteId,
      from: winner.status,
      to: 'ACCEPTED',
      actorId: actor.id,
      metadata: { reason: 'awarded' },
    });

    for (const other of others) {
      await tx.quote.update({ where: { id: other.id }, data: { status: 'REJECTED' } });
      await recordStatusChange(tx, {
        entityType: 'QUOTE',
        entityId: other.id,
        from: other.status,
        to: 'REJECTED',
        actorId: actor.id,
        metadata: { reason: 'another_quote_awarded' },
      });
    }

    const awarded = await tx.rfq.findUniqueOrThrow({
      where: { id: rfqId },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    return {
      rfq: serializeRfq(awarded),
      acceptedQuoteId: quoteId,
      rejectedQuoteIds: others.map((o) => o.id),
    };
  });

  return result;
}
