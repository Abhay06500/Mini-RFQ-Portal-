import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { conflict, notFound, unprocessable } from '../errors.js';
import type { AuthUser } from '../types/express.js';
import { paginationMeta } from './rfq.service.js';
import { serializeUser } from './serializers.js';

export async function listUsers(filters: { role?: string; q?: string }, page: number, pageSize: number) {
  const where: Prisma.UserWhereInput = {};
  if (filters.role) where.role = filters.role as Prisma.UserWhereInput['role'];
  if (filters.q) {
    where.OR = [{ name: { contains: filters.q } }, { email: { contains: filters.q } }];
  }
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    }),
  ]);
  return { items: rows.map(serializeUser), pagination: paginationMeta(page, pageSize, total) };
}

/**
 * Admin account changes. Guards
 * - Admins cannot demote or disable their own account, so the last admin cannot lock everyone out.
 * - A role cannot change while the user still owns RFQs or quotations, because those records
 *   depend on the role they were created under.
 */
export async function updateUser(
  actor: AuthUser,
  targetId: string,
  changes: { role?: 'BUYER' | 'VENDOR' | 'ADMIN'; isActive?: boolean },
) {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw notFound('User not found');

  if (target.id === actor.id) {
    if (changes.isActive === false || (changes.role && changes.role !== 'ADMIN')) {
      throw unprocessable('SELF_CHANGE_FORBIDDEN', 'You cannot demote or disable your own account');
    }
  }

  if (changes.role && changes.role !== target.role) {
    const [rfqCount, quoteCount] = await Promise.all([
      prisma.rfq.count({ where: { buyerId: target.id } }),
      prisma.quote.count({ where: { vendorId: target.id } }),
    ]);
    if (rfqCount > 0 || quoteCount > 0) {
      throw conflict('USER_HAS_ACTIVITY', 'This user already owns RFQs or quotations, so their role cannot change');
    }
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: { role: changes.role, isActive: changes.isActive },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });
  return serializeUser(updated);
}

export async function listAllQuotes(
  filters: { status?: string; rfqId?: string },
  page: number,
  pageSize: number,
) {
  const where: Prisma.QuoteWhereInput = {};
  if (filters.status) where.status = filters.status as Prisma.QuoteWhereInput['status'];
  if (filters.rfqId) where.rfqId = filters.rfqId;
  const [total, rows] = await Promise.all([
    prisma.quote.count({ where }),
    prisma.quote.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        vendor: { select: { id: true, name: true } },
        rfq: { select: { id: true, title: true, status: true } },
        revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 },
      },
    }),
  ]);
  return {
    items: rows.map((q) => ({
      id: q.id,
      status: q.status,
      vendor: q.vendor,
      rfq: q.rfq,
      currentRevisionNumber: q.revisions[0]?.revisionNumber ?? null,
      totalAmount: q.revisions[0] ? q.revisions[0].totalAmount.toFixed(2) : null,
      updatedAt: q.updatedAt.toISOString(),
    })),
    pagination: paginationMeta(page, pageSize, total),
  };
}
