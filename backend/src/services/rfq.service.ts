import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { now } from '../clock.js';
import { conflict, notFound, unprocessable } from '../errors.js';
import { money, toApiMoney } from '../money.js';
import type { AuthUser } from '../types/express.js';
import type {
  DiscoveryQuery,
  RfqCreateInput,
  RfqUpdateInput,
} from '../validation/schemas.js';
import { closeExpiredRfqs } from './closure.js';
import { recordStatusChange } from './history.js';
import { serializeFile, serializeRfq, type RfqRecord } from './serializers.js';

const RFQ_WITH_LINES = { lineItems: { orderBy: { sortOrder: 'asc' } } } as const;

/** Fields a buyer may not change once the RFQ is published, because vendors have already priced them. */
const LOCKED_AFTER_PUBLISH = ['title', 'category', 'deliveryLocation', 'lineItems'] as const;

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function paginationMeta(page: number, pageSize: number, total: number): Pagination {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function loadRfq(id: string): Promise<RfqRecord | null> {
  return prisma.rfq.findUnique({ where: { id }, include: RFQ_WITH_LINES });
}

/** Buyers who do not own an RFQ get the same 404 as a missing RFQ, so existence is not revealed. */
function assertOwner(actor: AuthUser, rfq: { buyerId: string } | null): asserts rfq is { buyerId: string } {
  if (!rfq || rfq.buyerId !== actor.id) throw notFound('RFQ not found');
}

export async function createRfq(actor: AuthUser, input: RfqCreateInput) {
  const created = await prisma.$transaction(async (tx) => {
    const rfq = await tx.rfq.create({
      data: {
        buyerId: actor.id,
        title: input.title,
        description: input.description,
        category: input.category,
        deliveryLocation: input.deliveryLocation,
        budget: input.budget ? money(input.budget) : null,
        deadline: input.deadline,
        status: 'DRAFT',
        lineItems: {
          create: input.lineItems.map((li, index) => ({
            name: li.name,
            quantity: li.quantity,
            unit: li.unit,
            sortOrder: index,
          })),
        },
      },
      include: RFQ_WITH_LINES,
    });
    await recordStatusChange(tx, {
      entityType: 'RFQ',
      entityId: rfq.id,
      from: null,
      to: 'DRAFT',
      actorId: actor.id,
      metadata: { action: 'created' },
    });
    return rfq;
  });
  return serializeRfq(created);
}

function sameLineItems(
  current: { name: string; quantity: number; unit: string }[],
  requested: { name: string; quantity: number; unit: string }[],
): boolean {
  if (current.length !== requested.length) return false;
  return current.every(
    (c, i) => c.name === requested[i].name && c.quantity === requested[i].quantity && c.unit === requested[i].unit,
  );
}

/**
 * Editing rules
 * - DRAFT: every field, including line items, can change.
 * - PUBLISHED: only description, budget and deadline. The deadline may only be extended.
 *   Title, category, delivery location and line items are locked, so existing quotations
 *   always price exactly what vendors saw.
 * - CLOSED or AWARDED: no edits.
 */
export async function updateRfq(actor: AuthUser, id: string, input: RfqUpdateInput) {
  await closeExpiredRfqs();
  const updated = await prisma.$transaction(async (tx) => {
    const rfq = await tx.rfq.findUnique({ where: { id }, include: RFQ_WITH_LINES });
    assertOwner(actor, rfq);
    const current = rfq as RfqRecord;

    if (current.status === 'DRAFT') {
      if (input.lineItems) {
        await tx.rfqLineItem.deleteMany({ where: { rfqId: id } });
      }
      return tx.rfq.update({
        where: { id },
        data: {
          title: input.title,
          description: input.description,
          category: input.category,
          deliveryLocation: input.deliveryLocation,
          budget: input.budget === undefined ? undefined : input.budget ? money(input.budget) : null,
          deadline: input.deadline,
          lineItems: input.lineItems
            ? {
                create: input.lineItems.map((li, index) => ({
                  name: li.name,
                  quantity: li.quantity,
                  unit: li.unit,
                  sortOrder: index,
                })),
              }
            : undefined,
        },
        include: RFQ_WITH_LINES,
      });
    }

    if (current.status === 'PUBLISHED') {
      const attemptedLocked: string[] = [];
      if (input.title !== undefined && input.title !== current.title) attemptedLocked.push('title');
      if (input.category !== undefined && input.category !== current.category) attemptedLocked.push('category');
      if (input.deliveryLocation !== undefined && input.deliveryLocation !== current.deliveryLocation) {
        attemptedLocked.push('deliveryLocation');
      }
      if (
        input.lineItems !== undefined &&
        !sameLineItems(
          [...current.lineItems].sort((a, b) => a.sortOrder - b.sortOrder),
          input.lineItems,
        )
      ) {
        attemptedLocked.push('lineItems');
      }
      if (attemptedLocked.length > 0) {
        throw conflict(
          'RFQ_LOCKED',
          'After publication only the description, budget and deadline can change',
          { lockedFields: LOCKED_AFTER_PUBLISH.filter((f) => attemptedLocked.includes(f)) },
        );
      }
      if (input.deadline !== undefined) {
        if (input.deadline.getTime() <= now().getTime()) {
          throw unprocessable('DEADLINE_IN_PAST', 'The new deadline must be in the future');
        }
        if (input.deadline.getTime() <= current.deadline.getTime()) {
          throw unprocessable('DEADLINE_CAN_ONLY_EXTEND', 'A published RFQ deadline can only be extended');
        }
      }
      return tx.rfq.update({
        where: { id },
        data: {
          description: input.description,
          budget: input.budget === undefined ? undefined : input.budget ? money(input.budget) : null,
          deadline: input.deadline,
        },
        include: RFQ_WITH_LINES,
      });
    }

    throw conflict('RFQ_NOT_EDITABLE', `An RFQ with status ${current.status} can no longer be edited`);
  });
  return serializeRfq(updated);
}

/** Publishing requires at least one line item and a future deadline. Everything else was validated on save. */
export async function publishRfq(actor: AuthUser, id: string) {
  await closeExpiredRfqs();
  const published = await prisma.$transaction(async (tx) => {
    const rfq = await tx.rfq.findUnique({ where: { id }, include: RFQ_WITH_LINES });
    assertOwner(actor, rfq);
    const current = rfq as RfqRecord;

    if (current.status !== 'DRAFT') {
      throw conflict('INVALID_TRANSITION', `Only draft RFQs can be published (current status: ${current.status})`);
    }

    const problems: { field: string; message: string }[] = [];
    if (current.lineItems.length === 0) {
      problems.push({ field: 'lineItems', message: 'At least one line item is required' });
    }
    if (current.deadline.getTime() <= now().getTime()) {
      problems.push({ field: 'deadline', message: 'The submission deadline must be in the future' });
    }
    if (problems.length > 0) {
      throw unprocessable('RFQ_NOT_PUBLISHABLE', 'The RFQ cannot be published yet', problems);
    }

    // Guarded transition: only a DRAFT row can move to PUBLISHED.
    const result = await tx.rfq.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'PUBLISHED', publishedAt: now() },
    });
    if (result.count !== 1) throw conflict('INVALID_TRANSITION', 'The RFQ was changed by another request');

    await recordStatusChange(tx, {
      entityType: 'RFQ',
      entityId: id,
      from: 'DRAFT',
      to: 'PUBLISHED',
      actorId: actor.id,
    });
    return tx.rfq.findUniqueOrThrow({ where: { id }, include: RFQ_WITH_LINES });
  });
  return serializeRfq(published);
}

function summarize(rfq: {
  id: string;
  title: string;
  category: string;
  deliveryLocation: string;
  budget: Prisma.Decimal | null;
  deadline: Date;
  status: string;
  updatedAt: Date;
  buyerId: string;
  _count?: { quotes: number };
}) {
  return {
    id: rfq.id,
    buyerId: rfq.buyerId,
    title: rfq.title,
    category: rfq.category,
    deliveryLocation: rfq.deliveryLocation,
    budget: rfq.budget === null ? null : toApiMoney(rfq.budget),
    deadline: rfq.deadline.toISOString(),
    status: rfq.status,
    updatedAt: rfq.updatedAt.toISOString(),
    quoteCount: rfq._count?.quotes,
  };
}

/** Buyer's own RFQs, optionally filtered by status. */
export async function listBuyerRfqs(actor: AuthUser, status: string | undefined, page: number, pageSize: number) {
  await closeExpiredRfqs();
  const where: Prisma.RfqWhereInput = { buyerId: actor.id };
  if (status) where.status = status as Prisma.RfqWhereInput['status'];
  const [total, rows] = await Promise.all([
    prisma.rfq.count({ where }),
    prisma.rfq.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { quotes: true } } },
    }),
  ]);
  return { items: rows.map(summarize), pagination: paginationMeta(page, pageSize, total) };
}

/** Admin view of all RFQs. */
export async function listAllRfqs(
  filters: { status?: string; buyerId?: string },
  page: number,
  pageSize: number,
) {
  await closeExpiredRfqs();
  const where: Prisma.RfqWhereInput = {};
  if (filters.status) where.status = filters.status as Prisma.RfqWhereInput['status'];
  if (filters.buyerId) where.buyerId = filters.buyerId;
  const [total, rows] = await Promise.all([
    prisma.rfq.count({ where }),
    prisma.rfq.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { quotes: true } } },
    }),
  ]);
  return { items: rows.map(summarize), pagination: paginationMeta(page, pageSize, total) };
}

/**
 * Vendor discovery. Only PUBLISHED RFQs whose deadline is still ahead are returned. Results are
 * ordered by deadline then id, so pagination is deterministic. Vendors also see whether they have
 * already quoted, but never anyone else's quotation.
 */
export async function discoverRfqs(actor: AuthUser, query: DiscoveryQuery) {
  await closeExpiredRfqs();
  const at = now();
  const deadlineFilter: Prisma.DateTimeFilter = { gt: at };
  if (query.deadlineFrom) deadlineFilter.gte = query.deadlineFrom;
  if (query.deadlineTo) deadlineFilter.lte = query.deadlineTo;

  const where: Prisma.RfqWhereInput = { status: 'PUBLISHED', deadline: deadlineFilter };
  if (query.q) {
    where.OR = [{ title: { contains: query.q } }, { description: { contains: query.q } }];
  }
  if (query.category) where.category = query.category;
  if (query.location) where.deliveryLocation = { contains: query.location };

  const [total, rows] = await Promise.all([
    prisma.rfq.count({ where }),
    prisma.rfq.findMany({
      where,
      orderBy: [{ deadline: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
    }),
  ]);

  const myQuotes = rows.length
    ? await prisma.quote.findMany({
        where: { vendorId: actor.id, rfqId: { in: rows.map((r) => r.id) } },
        select: { id: true, rfqId: true, status: true },
      })
    : [];
  const myQuoteByRfq = new Map(myQuotes.map((q) => [q.rfqId, q]));

  return {
    items: rows.map((rfq) => ({
      ...summarize(rfq),
      lineItemCount: rfq.lineItems.length,
      myQuote: myQuoteByRfq.has(rfq.id)
        ? { id: myQuoteByRfq.get(rfq.id)!.id, status: myQuoteByRfq.get(rfq.id)!.status }
        : null,
    })),
    pagination: paginationMeta(query.page, query.pageSize, total),
  };
}

/**
 * Single RFQ detail with role-aware visibility.
 * - Buyer: owned RFQs only. Admin: any.
 * - Vendor: any RFQ except drafts (returned as not found). Vendors see their own quotation status only.
 */
export async function getRfqForUser(actor: AuthUser, id: string) {
  await closeExpiredRfqs();
  const rfq = await loadRfq(id);
  if (!rfq) throw notFound('RFQ not found');
  if (actor.role === 'BUYER' && rfq.buyerId !== actor.id) throw notFound('RFQ not found');
  if (actor.role === 'VENDOR' && rfq.status === 'DRAFT') throw notFound('RFQ not found');

  const attachments = await prisma.fileAttachment.findMany({
    where: { rfqId: id },
    orderBy: { createdAt: 'asc' },
  });

  const base = { ...serializeRfq(rfq), attachments: attachments.map(serializeFile) };

  if (actor.role === 'VENDOR') {
    const mine = await prisma.quote.findUnique({
      where: { rfqId_vendorId: { rfqId: id, vendorId: actor.id } },
      include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
    });
    return {
      ...base,
      myQuote: mine
        ? {
            id: mine.id,
            status: mine.status,
            revisionNumber: mine.revisions[0]?.revisionNumber ?? null,
            totalAmount: mine.revisions[0] ? toApiMoney(mine.revisions[0].totalAmount) : null,
          }
        : null,
    };
  }

  const quoteCount = await prisma.quote.count({ where: { rfqId: id } });
  return { ...base, quoteCount };
}

/** Status history for one RFQ. Buyer owner or admin only (the route enforces role, this enforces ownership). */
export async function getRfqHistory(actor: AuthUser, id: string) {
  const rfq = await prisma.rfq.findUnique({ where: { id }, select: { buyerId: true } });
  if (!rfq) throw notFound('RFQ not found');
  if (actor.role !== 'ADMIN' && rfq.buyerId !== actor.id) throw notFound('RFQ not found');
  return getStatusHistory('RFQ', id);
}

export async function getStatusHistory(entityType: 'RFQ' | 'QUOTE', entityId: string) {
  const rows = await prisma.statusHistory.findMany({
    where: { entityType, entityId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { actor: { select: { id: true, name: true, role: true } } },
  });
  return rows.map((h) => ({
    id: h.id,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    actor: h.actor ? { id: h.actor.id, name: h.actor.name, role: h.actor.role } : null,
    createdAt: h.createdAt.toISOString(),
    metadata: h.metadata ?? null,
  }));
}

