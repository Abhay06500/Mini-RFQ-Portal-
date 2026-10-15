import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { setNow } from '../src/clock.js';
import { prisma } from '../src/db.js';

export const app = createApp();
export type Agent = ReturnType<typeof request.agent>;

/** Fixed "today" used by every test. Deadlines are expressed relative to it. */
export const BASE_TIME = new Date('2026-10-15T09:00:00.000Z');
export const DAY_MS = 24 * 60 * 60 * 1000;
export const PASSWORD = 'Password123!';

export const at = (offsetMs: number) => new Date(BASE_TIME.getTime() + offsetMs);

/** Pins the server clock. Call with null in afterEach to restore real time. */
export function pinClock(date: Date | null): void {
  setNow(date);
}

export async function resetDatabase(): Promise<void> {
  await prisma.statusHistory.deleteMany();
  await prisma.fileAttachment.deleteMany();
  await prisma.quoteRevisionLineItem.deleteMany();
  await prisma.quoteRevision.deleteMany();
  await prisma.rfq.updateMany({ data: { awardedQuoteId: null } });
  await prisma.quote.deleteMany();
  await prisma.rfqLineItem.deleteMany();
  await prisma.rfq.deleteMany();
  await prisma.user.deleteMany();
}

let counter = 0;
export async function createUser(role: 'BUYER' | 'VENDOR' | 'ADMIN', name?: string, isActive = true) {
  counter += 1;
  const email = `${role.toLowerCase()}${counter}@test.local`;
  return prisma.user.create({
    data: {
      name: name ?? `${role} ${counter}`,
      email,
      role,
      isActive,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
    },
  });
}

/** Signs in through the real login endpoint and returns an agent that carries the session cookie. */
export async function signIn(email: string, password = PASSWORD): Promise<Agent> {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export const DEFAULT_LINE_ITEMS = [
  { name: 'Office chair', quantity: 100, unit: 'pcs' },
  { name: 'Standing desk', quantity: 20, unit: 'pcs' },
];

export function rfqPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Office supplies for Hyderabad site',
    description: 'Chairs and desks for the new site office.',
    category: 'Office Supplies',
    deliveryLocation: 'Hyderabad',
    budget: '400000',
    deadline: at(7 * DAY_MS).toISOString(),
    lineItems: DEFAULT_LINE_ITEMS,
    ...overrides,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Creates a draft through the API and publishes it. Returns the published RFQ body. */
export async function publishedRfq(buyer: Agent, overrides: Record<string, unknown> = {}): Promise<any> {
  const created = await buyer.post('/api/v1/rfqs').send(rfqPayload(overrides)).expect(201);
  const published = await buyer.post(`/api/v1/rfqs/${created.body.rfq.id}/publish`).expect(200);
  return published.body.rfq;
}

/** Builds a quote body for the default two-line RFQ. Line order follows the RFQ's sortOrder. */
export function quoteBody(rfq: any, chairPrice: string, deskPrice: string, deliveryDays = 7, notes?: string) {
  const [chair, desk] = rfq.lineItems;
  return {
    deliveryDays,
    notes: notes ?? null,
    lineItems: [
      { rfqLineItemId: chair.id, unitPrice: chairPrice },
      { rfqLineItemId: desk.id, unitPrice: deskPrice },
    ],
  };
}

/** Minimal bytes that pass the PDF signature check. */
export const PDF_BYTES = Buffer.from('%PDF-1.4\n% test specification\n1 0 obj<<>>endobj\n%%EOF\n');

/** Minimal ZIP local-file header with the OOXML markers the XLSX check looks for. */
export const XLSX_BYTES = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from('[Content_Types].xml xl/workbook.xml'),
  Buffer.alloc(32),
]);
/* eslint-enable @typescript-eslint/no-explicit-any */
