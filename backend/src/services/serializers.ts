import type { Prisma } from '@prisma/client';
import { toApiMoney } from '../money.js';

// Shapes returned by Prisma for the includes used across services.
export type RfqRecord = Prisma.RfqGetPayload<{ include: { lineItems: true } }>;
export type RevisionRecord = Prisma.QuoteRevisionGetPayload<{ include: { lineItems: true } }>;
export type FileRecord = Prisma.FileAttachmentGetPayload<object>;

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

export function serializeUser(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
  };
}

export function serializeFile(f: FileRecord) {
  return {
    id: f.id,
    kind: f.kind,
    originalName: f.originalName,
    mimeType: f.mimeType,
    sizeBytes: f.sizeBytes,
    createdAt: f.createdAt.toISOString(),
    downloadUrl: `/api/v1/files/${f.id}`,
  };
}

export function serializeRfq(rfq: RfqRecord) {
  return {
    id: rfq.id,
    buyerId: rfq.buyerId,
    title: rfq.title,
    description: rfq.description,
    category: rfq.category,
    deliveryLocation: rfq.deliveryLocation,
    budget: rfq.budget === null ? null : toApiMoney(rfq.budget),
    currency: rfq.currency,
    deadline: rfq.deadline.toISOString(),
    status: rfq.status,
    publishedAt: rfq.publishedAt?.toISOString() ?? null,
    awardedAt: rfq.awardedAt?.toISOString() ?? null,
    awardedQuoteId: rfq.awardedQuoteId,
    createdAt: rfq.createdAt.toISOString(),
    updatedAt: rfq.updatedAt.toISOString(),
    lineItems: [...rfq.lineItems]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((li) => ({
        id: li.id,
        name: li.name,
        quantity: li.quantity,
        unit: li.unit,
        sortOrder: li.sortOrder,
      })),
  };
}

export function serializeRevision(rev: RevisionRecord) {
  return {
    id: rev.id,
    revisionNumber: rev.revisionNumber,
    deliveryDays: rev.deliveryDays,
    notes: rev.notes,
    totalAmount: toApiMoney(rev.totalAmount),
    createdAt: rev.createdAt.toISOString(),
    createdById: rev.createdById,
    lineItems: rev.lineItems.map((l) => ({
      rfqLineItemId: l.rfqLineItemId,
      itemName: l.itemName,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: toApiMoney(l.unitPrice),
      lineTotal: toApiMoney(l.lineTotal),
    })),
  };
}

/**
 * Quote payload. `revisionsAsc` must be ordered by revisionNumber ascending. The last element is
 * the current revision, which comparison and award decisions use.
 */
export function serializeQuote(
  quote: {
    id: string;
    rfqId: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    vendor: { id: string; name: string };
    attachments: FileRecord[];
  },
  revisionsAsc: RevisionRecord[],
  options: { includeAllRevisions: boolean },
) {
  const latest = revisionsAsc[revisionsAsc.length - 1] ?? null;
  return {
    id: quote.id,
    rfqId: quote.rfqId,
    status: quote.status,
    vendor: { id: quote.vendor.id, name: quote.vendor.name },
    submittedAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
    currentRevision: latest ? serializeRevision(latest) : null,
    revisions: options.includeAllRevisions ? revisionsAsc.map(serializeRevision) : undefined,
    attachments: quote.attachments.map(serializeFile),
  };
}
