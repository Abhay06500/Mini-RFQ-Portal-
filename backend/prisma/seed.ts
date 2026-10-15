/**
 * Demo data for trying the portal. Idempotent: if the demo buyer already exists, nothing changes.
 * Every status-history row here describes a transition that actually happened in the seeded state,
 * so the history is consistent with the current RFQ and quotation statuses.
 *
 * Demo passwords are for local evaluation only. Change them before any real use.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { Prisma, type Quote, type RfqLineItem, type User } from '@prisma/client';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import { lineTotal, money, sumMoney } from '../src/money.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * DAY_MS);
const ahead = (days: number) => new Date(NOW + days * DAY_MS);

const DEMO_ACCOUNTS = [
  { name: 'Platform Admin', email: 'admin@rfq.example', role: 'ADMIN', password: 'Admin@12345' },
  { name: 'Acme Constructions', email: 'buyer@acme.example', role: 'BUYER', password: 'Buyer@12345' },
  { name: 'Zenith Infra Pvt Ltd', email: 'buyer2@zenith.example', role: 'BUYER', password: 'Buyer@12345' },
  { name: 'OfficeWorld Supplies', email: 'vendor@officeworld.example', role: 'VENDOR', password: 'Vendor@12345' },
  { name: 'DeskHub Interiors', email: 'vendor2@deskhub.example', role: 'VENDOR', password: 'Vendor@12345' },
  { name: 'SeatCraft Furnishings', email: 'vendor3@seatcraft.example', role: 'VENDOR', password: 'Vendor@12345' },
] as const;

async function recordHistory(
  entityType: 'RFQ' | 'QUOTE',
  entityId: string,
  from: string | null,
  to: string,
  actorId: string | null,
  at: Date,
  metadata?: Prisma.InputJsonValue,
) {
  await prisma.statusHistory.create({
    data: { entityType, entityId, fromStatus: from, toStatus: to, actorId, createdAt: at, metadata },
  });
}

type LineSpec = { name: string; quantity: number; unit: string };

async function createRfq(args: {
  buyer: User;
  title: string;
  description: string;
  category: string;
  location: string;
  budget?: string;
  deadline: Date;
  lines: LineSpec[];
  createdAt: Date;
  publishedAt?: Date;
}) {
  const rfq = await prisma.rfq.create({
    data: {
      buyerId: args.buyer.id,
      title: args.title,
      description: args.description,
      category: args.category,
      deliveryLocation: args.location,
      budget: args.budget ? money(args.budget) : null,
      deadline: args.deadline,
      status: 'DRAFT',
      createdAt: args.createdAt,
      lineItems: {
        create: args.lines.map((l, i) => ({ name: l.name, quantity: l.quantity, unit: l.unit, sortOrder: i })),
      },
    },
    include: { lineItems: { orderBy: { sortOrder: 'asc' } } },
  });
  await recordHistory('RFQ', rfq.id, null, 'DRAFT', args.buyer.id, args.createdAt, { action: 'created' });
  if (args.publishedAt) {
    await prisma.rfq.update({
      where: { id: rfq.id },
      data: { status: 'PUBLISHED', publishedAt: args.publishedAt },
    });
    await recordHistory('RFQ', rfq.id, 'DRAFT', 'PUBLISHED', args.buyer.id, args.publishedAt);
  }
  return rfq;
}

/** Creates a quotation with its revisions. Prices are given per RFQ line, in the same order as the lines. */
async function createQuote(args: {
  rfqId: string;
  lines: RfqLineItem[];
  vendor: User;
  revisions: { at: Date; days: number; notes?: string; prices: string[] }[];
}): Promise<Quote> {
  const first = args.revisions[0];
  const last = args.revisions[args.revisions.length - 1];
  const quote = await prisma.quote.create({
    data: {
      rfqId: args.rfqId,
      vendorId: args.vendor.id,
      status: 'SUBMITTED',
      createdAt: first.at,
      updatedAt: last.at,
    },
  });
  for (const [index, rev] of args.revisions.entries()) {
    const computed = args.lines.map((line, i) => {
      const unitPrice = money(rev.prices[i]);
      return {
        rfqLineItemId: line.id,
        itemName: line.name,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice,
        lineTotal: lineTotal(unitPrice, line.quantity),
      };
    });
    await prisma.quoteRevision.create({
      data: {
        quoteId: quote.id,
        revisionNumber: index + 1,
        deliveryDays: rev.days,
        notes: rev.notes ?? null,
        totalAmount: sumMoney(computed.map((c) => c.lineTotal)),
        createdById: args.vendor.id,
        createdAt: rev.at,
        lineItems: { create: computed },
      },
    });
  }
  await recordHistory('QUOTE', quote.id, null, 'SUBMITTED', args.vendor.id, first.at, {
    action: 'submitted',
    revisionNumber: 1,
  });
  return quote;
}

/** Writes a small placeholder PDF into the upload directory and records it as an attachment. */
async function attachPlaceholderPdf(args: { rfqId?: string; quoteId?: string; uploader: User; label: string; at: Date }) {
  const root = path.resolve(config.UPLOAD_DIR);
  await mkdir(root, { recursive: true });
  const storageKey = `${randomUUID()}.pdf`;
  const body = `%PDF-1.4\n% ${args.label} (demo placeholder)\n%%EOF\n`;
  await writeFile(path.join(root, storageKey), body, { flag: 'wx' });
  await prisma.fileAttachment.create({
    data: {
      rfqId: args.rfqId ?? null,
      quoteId: args.quoteId ?? null,
      kind: 'PDF',
      originalName: `${args.label}.pdf`,
      storageKey,
      mimeType: 'application/pdf',
      sizeBytes: Buffer.byteLength(body),
      uploadedById: args.uploader.id,
      createdAt: args.at,
    },
  });
}

async function main(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: 'buyer@acme.example' } });
  if (existing) {
    console.log('Demo data is already present. Nothing was changed.');
    return;
  }

  const users: Record<string, User> = {};
  for (const account of DEMO_ACCOUNTS) {
    users[account.email] = await prisma.user.create({
      data: {
        name: account.name,
        email: account.email,
        role: account.role,
        passwordHash: await bcrypt.hash(account.password, 12),
      },
    });
  }
  const acme = users['buyer@acme.example'];
  const zenith = users['buyer2@zenith.example'];
  const officeWorld = users['vendor@officeworld.example'];
  const deskHub = users['vendor2@deskhub.example'];
  const seatCraft = users['vendor3@seatcraft.example'];

  // 1. Open RFQ from the assignment example. OfficeWorld revised its chair price; DeskHub quoted once.
  const hyderabad = await createRfq({
    buyer: acme,
    title: 'Office supplies for Hyderabad site',
    description:
      'Ergonomic chairs and standing-height desks for the new site office. Delivery to the Hyderabad site gate; goods must include a 12-month warranty.',
    category: 'Office Supplies',
    location: 'Hyderabad',
    budget: '400000',
    deadline: ahead(10),
    createdAt: ago(6),
    publishedAt: ago(5),
    lines: [
      { name: 'Office chair', quantity: 100, unit: 'pcs' },
      { name: 'Standing desk', quantity: 20, unit: 'pcs' },
    ],
  });
  const hyderabadLines = hyderabad.lineItems;
  await attachPlaceholderPdf({ rfqId: hyderabad.id, uploader: acme, label: 'site-requirements', at: ago(5) });

  const officeWorldQuote = await createQuote({
    rfqId: hyderabad.id,
    lines: hyderabadLines,
    vendor: officeWorld,
    revisions: [
      { at: ago(3), days: 10, prices: ['2000', '8000'], notes: 'Initial offer.' },
      { at: ago(1), days: 10, prices: ['1900', '8000'], notes: 'Chair price revised after bulk discount approval.' },
    ],
  });
  await attachPlaceholderPdf({ quoteId: officeWorldQuote.id, uploader: officeWorld, label: 'officeworld-price-sheet', at: ago(1) });

  await createQuote({
    rfqId: hyderabad.id,
    lines: hyderabadLines,
    vendor: deskHub,
    revisions: [{ at: ago(2), days: 7, prices: ['2200', '7000'], notes: 'Faster delivery from Bengaluru stock.' }],
  });

  // 2. Draft RFQ. Not yet visible to vendors.
  await createRfq({
    buyer: acme,
    title: 'Site safety equipment',
    description: 'Helmets, safety boots and high-visibility vests for the Hyderabad tower project.',
    category: 'Safety',
    location: 'Hyderabad',
    deadline: ahead(20),
    createdAt: ago(1),
    lines: [
      { name: 'Safety helmet', quantity: 200, unit: 'pcs' },
      { name: 'Safety boots', quantity: 80, unit: 'pairs' },
    ],
  });

  // 3. Closed RFQ with a shortlisted quotation. Deadline passed 2 days ago.
  const zenithFurniture = await createRfq({
    buyer: zenith,
    title: 'Office furniture for Zenith head office',
    description: 'Executive chairs and conference tables for the third floor refit.',
    category: 'Furniture',
    location: 'Bengaluru',
    deadline: ago(2),
    createdAt: ago(22),
    publishedAt: ago(20),
    lines: [
      { name: 'Executive chair', quantity: 40, unit: 'pcs' },
      { name: 'Conference table', quantity: 2, unit: 'pcs' },
    ],
  });
  const furnitureSeatCraft = await createQuote({
    rfqId: zenithFurniture.id,
    lines: zenithFurniture.lineItems,
    vendor: seatCraft,
    revisions: [{ at: ago(4), days: 14, prices: ['3500', '45000'], notes: 'Includes installation.' }],
  });
  await createQuote({
    rfqId: zenithFurniture.id,
    lines: zenithFurniture.lineItems,
    vendor: deskHub,
    revisions: [{ at: ago(3), days: 10, prices: ['3700', '42000'], notes: 'Installation billed separately.' }],
  });
  await prisma.quote.update({ where: { id: furnitureSeatCraft.id }, data: { status: 'SHORTLISTED' } });
  await recordHistory('QUOTE', furnitureSeatCraft.id, 'SUBMITTED', 'SHORTLISTED', zenith.id, ago(2));
  await prisma.rfq.update({ where: { id: zenithFurniture.id }, data: { status: 'CLOSED' } });
  await recordHistory('RFQ', zenithFurniture.id, 'PUBLISHED', 'CLOSED', null, ago(2), { reason: 'deadline_passed' });

  // 4. Awarded RFQ. OfficeWorld won with the lower total.
  const pantry = await createRfq({
    buyer: zenith,
    title: 'Pantry and canteen supplies, Q4',
    description: 'Packaged drinking water and tea/coffee supplies for the Bengaluru office pantry.',
    category: 'Food & Pantry',
    location: 'Bengaluru',
    deadline: ago(10),
    createdAt: ago(25),
    publishedAt: ago(24),
    lines: [
      { name: 'Packaged drinking water 20 L', quantity: 300, unit: 'cans' },
      { name: 'Tea and coffee sachet box', quantity: 50, unit: 'boxes' },
    ],
  });
  const pantryWinner = await createQuote({
    rfqId: pantry.id,
    lines: pantry.lineItems,
    vendor: officeWorld,
    revisions: [{ at: ago(12), days: 5, prices: ['85', '900'], notes: 'Two deliveries per week.' }],
  });
  const pantryLoser = await createQuote({
    rfqId: pantry.id,
    lines: pantry.lineItems,
    vendor: deskHub,
    revisions: [{ at: ago(11), days: 4, prices: ['95', '880'], notes: 'Daily delivery.' }],
  });
  await prisma.quote.update({ where: { id: pantryWinner.id }, data: { status: 'ACCEPTED' } });
  await prisma.quote.update({ where: { id: pantryLoser.id }, data: { status: 'REJECTED' } });
  await prisma.rfq.update({
    where: { id: pantry.id },
    data: { status: 'AWARDED', awardedAt: ago(7), awardedById: zenith.id, awardedQuoteId: pantryWinner.id },
  });
  await recordHistory('RFQ', pantry.id, 'PUBLISHED', 'CLOSED', null, ago(10), { reason: 'deadline_passed' });
  await recordHistory('RFQ', pantry.id, 'CLOSED', 'AWARDED', zenith.id, ago(7), { awardedQuoteId: pantryWinner.id });
  await recordHistory('QUOTE', pantryWinner.id, 'SUBMITTED', 'ACCEPTED', zenith.id, ago(7), { reason: 'awarded' });
  await recordHistory('QUOTE', pantryLoser.id, 'SUBMITTED', 'REJECTED', zenith.id, ago(7), { reason: 'another_quote_awarded' });

  console.log('Demo data created. Accounts (change these passwords before real use):');
  for (const a of DEMO_ACCOUNTS) console.log(`  ${a.role.padEnd(6)} ${a.email.padEnd(28)} ${a.password}`);
}

main()
  .catch((err) => {
    console.error('Seeding failed', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
