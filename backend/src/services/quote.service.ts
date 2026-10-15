import type { Prisma, RfqLineItem } from '@prisma/client';
import { prisma } from '../db.js';
import { now } from '../clock.js';
import { conflict, forbidden, notFound, unprocessable } from '../errors.js';
import { lineTotal, money, sumMoney, type Money } from '../money.js';
import type { AuthUser } from '../types/express.js';
import type { QuoteSubmitInput } from '../validation/schemas.js';
import { closeExpiredRfqs } from './closure.js';
import { getStatusHistory } from './rfq.service.js';
import { recordStatusChange } from './history.js';
import { serializeQuote, type RevisionRecord } from './serializers.js';

type Tx = Prisma.TransactionClient;

const MAX_ATTACHMENTS_PER_QUOTE = 5;

interface BuiltLine {
  rfqLineItemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPrice: Money;
  lineTotal: Money;
}

interface BuiltRevision {
  lines: BuiltLine[];
  total: Money;
}

/**
 * The server is the only source of totals. The client sends unit prices, and each line total and
 * the quotation total are recomputed here from the RFQ's own quantities. Quantities and names are
 * copied from the RFQ line item, so the snapshot cannot drift from what was requested.
 */
export function buildRevision(
  rfqLines: RfqLineItem[],
  submitted: QuoteSubmitInput['lineItems'],
): BuiltRevision {
  const rfqIds = new Set(rfqLines.map((l) => l.id));
  const problems: { field: string; message: string }[] = [];
  const priceByLine = new Map<string, string>();

  for (const line of submitted) {
    if (!rfqIds.has(line.rfqLineItemId)) {
      problems.push({ field: 'lineItems', message: `Unknown line item ${line.rfqLineItemId}` });
      continue;
    }
    if (priceByLine.has(line.rfqLineItemId)) {
      problems.push({ field: 'lineItems', message: `Duplicate price for line item ${line.rfqLineItemId}` });
      continue;
    }
    priceByLine.set(line.rfqLineItemId, line.unitPrice);
  }
  for (const rfqLine of rfqLines) {
    if (!priceByLine.has(rfqLine.id)) {
      problems.push({ field: 'lineItems', message: `Missing unit price for "${rfqLine.name}"` });
    }
  }
  if (problems.length > 0) {
    throw unprocessable('QUOTE_INCOMPLETE', 'Every RFQ line item needs exactly one valid unit price', problems);
  }

  const lines = [...rfqLines]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((rfqLine) => {
      const unitPrice = money(priceByLine.get(rfqLine.id) as string);
      return {
        rfqLineItemId: rfqLine.id,
        itemName: rfqLine.name,
        quantity: rfqLine.quantity,
        unit: rfqLine.unit,
        unitPrice,
        lineTotal: lineTotal(unitPrice, rfqLine.quantity),
      };
    });
  return { lines, total: sumMoney(lines.map((l) => l.lineTotal)) };
}

/** Throws unless the RFQ accepts quotation submissions or revisions right now. */
function assertAcceptingQuotes(rfq: { status: string; deadline: Date }): void {
  if (now().getTime() >= rfq.deadline.getTime()) {
    throw conflict(
      'DEADLINE_PASSED',
      'The submission deadline has passed. Quotations can no longer be submitted or changed.',
    );
  }
  if (rfq.status !== 'PUBLISHED') {
    throw conflict('RFQ_NOT_OPEN', 'This RFQ is not accepting quotations');
  }
}

async function insertRevision(
  tx: Tx,
  quoteId: string,
  revisionNumber: number,
  input: QuoteSubmitInput,
  built: BuiltRevision,
  actorId: string,
): Promise<void> {
  await tx.quoteRevision.create({
    data: {
      quoteId,
      revisionNumber,
      deliveryDays: input.deliveryDays,
      notes: input.notes ?? null,
      totalAmount: built.total,
      createdById: actorId,
      lineItems: {
        create: built.lines.map((l) => ({
          rfqLineItemId: l.rfqLineItemId,
          itemName: l.itemName,
          quantity: l.quantity,
          unit: l.unit,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
        })),
      },
    },
  });
}

const QUOTE_INCLUDE = {
  vendor: { select: { id: true, name: true } },
  attachments: { orderBy: { createdAt: 'asc' } },
  revisions: {
    orderBy: { revisionNumber: 'asc' },
    include: { lineItems: true },
  },
} as const;

async function loadQuoteView(id: string, includeAllRevisions: boolean) {
  const quote = await prisma.quote.findUniqueOrThrow({ where: { id }, include: QUOTE_INCLUDE });
  const revisions = quote.revisions as RevisionRecord[];
  return serializeQuote(quote, revisions, { includeAllRevisions });
}

/** First submission. Creates the quotation and its revision 1 together. */
export async function submitQuote(actor: AuthUser, rfqId: string, input: QuoteSubmitInput) {
  await closeExpiredRfqs();
  const quoteId = await prisma.$transaction(async (tx) => {
    const rfq = await tx.rfq.findUnique({
      where: { id: rfqId },
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!rfq || rfq.status === 'DRAFT') throw notFound('RFQ not found');
    assertAcceptingQuotes(rfq);

    const existing = await tx.quote.findUnique({
      where: { rfqId_vendorId: { rfqId, vendorId: actor.id } },
      select: { id: true },
    });
    if (existing) {
      throw conflict('QUOTE_EXISTS', 'You have already submitted a quotation for this RFQ. Revise it instead.', {
        quoteId: existing.id,
      });
    }

    const built = buildRevision(rfq.lineItems, input.lineItems);
    const quote = await tx.quote.create({
      data: { rfqId, vendorId: actor.id, status: 'SUBMITTED' },
    });
    await insertRevision(tx, quote.id, 1, input, built, actor.id);
    await recordStatusChange(tx, {
      entityType: 'QUOTE',
      entityId: quote.id,
      from: null,
      to: 'SUBMITTED',
      actorId: actor.id,
      metadata: { action: 'submitted', revisionNumber: 1 },
    });
    return quote.id;
  });
  return loadQuoteView(quoteId, true);
}

/**
 * Revision. Appends a new immutable QuoteRevision. Earlier revisions are never updated.
 * Rejected after the deadline. The check happens inside the transaction, so a revision cannot
 * slip in between the deadline check and the write.
 */
export async function reviseQuote(actor: AuthUser, quoteId: string, input: QuoteSubmitInput) {
  await closeExpiredRfqs();
  await prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      include: {
        rfq: { include: { lineItems: { orderBy: { sortOrder: 'asc' } } } },
        revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 },
      },
    });
    // Another vendor's quotation is reported as not found, so its existence is not revealed.
    if (!quote || quote.vendorId !== actor.id) throw notFound('Quotation not found');
    assertAcceptingQuotes(quote.rfq);
    if (quote.status !== 'SUBMITTED') {
      throw conflict('QUOTE_LOCKED', `A quotation with status ${quote.status} can no longer be revised`);
    }

    const nextRevision = (quote.revisions[0]?.revisionNumber ?? 0) + 1;
    const built = buildRevision(quote.rfq.lineItems, input.lineItems);
    await insertRevision(tx, quote.id, nextRevision, input, built, actor.id);
    await tx.quote.update({ where: { id: quote.id }, data: { updatedAt: now() } });
  });
  return loadQuoteView(quoteId, true);
}

/** Vendor's own quotations. */
export async function listVendorQuotes(actor: AuthUser) {
  await closeExpiredRfqs();
  const quotes = await prisma.quote.findMany({
    where: { vendorId: actor.id },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: 100,
    include: {
      rfq: { select: { id: true, title: true, status: true, deadline: true } },
      revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 },
    },
  });
  return quotes.map((q) => ({
    id: q.id,
    rfqId: q.rfqId,
    status: q.status,
    rfq: {
      id: q.rfq.id,
      title: q.rfq.title,
      status: q.rfq.status,
      deadline: q.rfq.deadline.toISOString(),
    },
    currentRevisionNumber: q.revisions[0]?.revisionNumber ?? null,
    totalAmount: q.revisions[0] ? q.revisions[0].totalAmount.toFixed(2) : null,
    updatedAt: q.updatedAt.toISOString(),
  }));
}

/**
 * Visibility
 * - Vendor: own quotation only.
 * - Buyer: quotations on their own RFQ, and only after the RFQ is CLOSED or AWARDED.
 * - Admin: any quotation.
 */
async function assertCanViewQuote(actor: AuthUser, quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { id: true, vendorId: true, rfq: { select: { buyerId: true, status: true } } },
  });
  if (!quote) throw notFound('Quotation not found');
  if (actor.role === 'ADMIN') return quote;
  if (actor.role === 'VENDOR') {
    if (quote.vendorId !== actor.id) throw notFound('Quotation not found');
    return quote;
  }
  if (quote.rfq.buyerId !== actor.id) throw notFound('Quotation not found');
  if (quote.rfq.status !== 'CLOSED' && quote.rfq.status !== 'AWARDED') {
    throw forbidden('Quotations become visible to the buyer after the RFQ closes');
  }
  return quote;
}

export async function getQuoteForUser(actor: AuthUser, quoteId: string) {
  await closeExpiredRfqs();
  await assertCanViewQuote(actor, quoteId);
  return loadQuoteView(quoteId, true);
}

export async function getQuoteHistoryForUser(actor: AuthUser, quoteId: string) {
  await closeExpiredRfqs();
  await assertCanViewQuote(actor, quoteId);
  return getStatusHistory('QUOTE', quoteId);
}

/** Buyer marks a quotation as shortlisted after the RFQ closes. This is a status change, so it is recorded. */
export async function shortlistQuote(actor: AuthUser, quoteId: string) {
  await closeExpiredRfqs();
  await prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      select: { id: true, status: true, rfq: { select: { buyerId: true, status: true } } },
    });
    if (!quote || quote.rfq.buyerId !== actor.id) throw notFound('Quotation not found');
    if (quote.rfq.status !== 'CLOSED') {
      throw conflict('RFQ_NOT_CLOSED', 'Quotations can be shortlisted only after the RFQ closes');
    }
    if (quote.status !== 'SUBMITTED') {
      throw conflict('INVALID_TRANSITION', `A quotation with status ${quote.status} cannot be shortlisted`);
    }
    const result = await tx.quote.updateMany({
      where: { id: quoteId, status: 'SUBMITTED' },
      data: { status: 'SHORTLISTED' },
    });
    if (result.count !== 1) throw conflict('INVALID_TRANSITION', 'The quotation was changed by another request');
    await recordStatusChange(tx, {
      entityType: 'QUOTE',
      entityId: quoteId,
      from: 'SUBMITTED',
      to: 'SHORTLISTED',
      actorId: actor.id,
    });
  });
  return loadQuoteView(quoteId, true);
}

export const QUOTE_ATTACHMENT_LIMIT = MAX_ATTACHMENTS_PER_QUOTE;

/**
 * Buyer comparison view. Lists the current (latest) revision of every quotation on the RFQ.
 * Sorting uses numeric Decimal and Date values, never formatted strings. Ties break on submission
 * time, then vendor name, then quote id, so the order is stable across requests.
 */
export async function compareQuotes(
  actor: AuthUser,
  rfqId: string,
  sortBy: 'total' | 'deliveryTime',
  order: 'asc' | 'desc',
) {
  await closeExpiredRfqs();
  const rfq = await prisma.rfq.findUnique({
    where: { id: rfqId },
    select: { id: true, buyerId: true, status: true, title: true, deadline: true, budget: true },
  });
  if (!rfq) throw notFound('RFQ not found');
  if (actor.role === 'BUYER' && rfq.buyerId !== actor.id) throw notFound('RFQ not found');
  if (actor.role === 'BUYER' && rfq.status !== 'CLOSED' && rfq.status !== 'AWARDED') {
    throw forbidden('Quotations can be compared only after the RFQ closes');
  }

  const quotes = await prisma.quote.findMany({
    where: { rfqId },
    include: {
      vendor: { select: { id: true, name: true } },
      attachments: { orderBy: { createdAt: 'asc' } },
      revisions: {
        orderBy: { revisionNumber: 'desc' },
        take: 1,
        include: { lineItems: true },
      },
    },
  });

  const direction = order === 'asc' ? 1 : -1;
  const rows = quotes.map((q) => ({
    quote: q,
    total: q.revisions[0]?.totalAmount ?? money(0),
    days: q.revisions[0]?.deliveryDays ?? Number.MAX_SAFE_INTEGER,
  }));

  rows.sort((a, b) => {
    const primary =
      sortBy === 'total' ? a.total.comparedTo(b.total) : a.days - b.days;
    if (primary !== 0) return primary * direction;
    const submitted = a.quote.createdAt.getTime() - b.quote.createdAt.getTime();
    if (submitted !== 0) return submitted;
    const vendor = a.quote.vendor.name.localeCompare(b.quote.vendor.name);
    if (vendor !== 0) return vendor;
    return a.quote.id.localeCompare(b.quote.id);
  });

  return {
    rfq: { id: rfq.id, title: rfq.title, status: rfq.status, deadline: rfq.deadline.toISOString(), budget: rfq.budget?.toFixed(2) ?? null },
    sortBy,
    order,
    items: rows.map(({ quote }) => serializeQuote(quote, quote.revisions.slice().reverse(), { includeAllRevisions: false })),
  };
}
