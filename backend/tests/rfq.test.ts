import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pinClock, at, DAY_MS, createUser, resetDatabase, signIn, rfqPayload, publishedRfq } from './helpers.js';
import { prisma } from '../src/db.js';

describe('RFQ lifecycle', () => {
  beforeEach(async () => {
    await resetDatabase();
    pinClock(at(0));
  });
  afterEach(() => pinClock(null));

  it('creates a draft, rejects invalid fields, and records the creation', async () => {
    const buyer = await signIn((await createUser('BUYER')).email);
    const bad = await buyer.post('/api/v1/rfqs').send(rfqPayload({ deadline: 'next tuesday', lineItems: [{ name: 'x', quantity: 0, unit: 'pcs' }] }));
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');

    const ok = await buyer.post('/api/v1/rfqs').send(rfqPayload());
    expect(ok.status).toBe(201);
    expect(ok.body.rfq.status).toBe('DRAFT');
    expect(ok.body.rfq.budget).toBe('400000.00');
    expect(ok.body.rfq.lineItems).toHaveLength(2);

    const history = await buyer.get(`/api/v1/rfqs/${ok.body.rfq.id}/history`);
    expect(history.body.history).toHaveLength(1);
    expect(history.body.history[0]).toMatchObject({ fromStatus: null, toStatus: 'DRAFT' });
  });

  it('refuses to publish without line items or with a deadline that is not in the future', async () => {
    const buyer = await signIn((await createUser('BUYER')).email);
    const noItems = await buyer.post('/api/v1/rfqs').send(rfqPayload({ lineItems: [] }));
    const noItemsPub = await buyer.post(`/api/v1/rfqs/${noItems.body.rfq.id}/publish`);
    expect(noItemsPub.status).toBe(422);
    expect(noItemsPub.body.error.details.map((d: { field: string }) => d.field)).toContain('lineItems');

    const past = await buyer.post('/api/v1/rfqs').send(rfqPayload({ deadline: at(-DAY_MS).toISOString() }));
    const pastPub = await buyer.post(`/api/v1/rfqs/${past.body.rfq.id}/publish`);
    expect(pastPub.status).toBe(422);
    expect(pastPub.body.error.details.map((d: { field: string }) => d.field)).toContain('deadline');
  });

  it('publishes a valid RFQ and records the DRAFT to PUBLISHED transition', async () => {
    const buyer = await signIn((await createUser('BUYER')).email);
    const rfq = await publishedRfq(buyer);
    expect(rfq.status).toBe('PUBLISHED');
    expect(rfq.publishedAt).not.toBeNull();

    const history = await buyer.get(`/api/v1/rfqs/${rfq.id}/history`);
    expect(history.body.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['DRAFT', 'PUBLISHED']);
    expect(history.body.history[1].actor.id).toBeTruthy();
  });

  it('prevents one buyer from reading or editing another buyer\'s RFQ', async () => {
    const owner = await signIn((await createUser('BUYER')).email);
    const other = await signIn((await createUser('BUYER')).email);
    const draft = await owner.post('/api/v1/rfqs').send(rfqPayload());
    const id = draft.body.rfq.id;

    expect((await other.get(`/api/v1/rfqs/${id}`)).status).toBe(404);
    expect((await other.patch(`/api/v1/rfqs/${id}`).send({ title: 'Hijacked title' })).status).toBe(404);
    expect((await other.post(`/api/v1/rfqs/${id}/publish`)).status).toBe(404);
    expect((await owner.get(`/api/v1/rfqs/${id}`)).body.rfq.title).toBe('Office supplies for Hyderabad site');
  });

  it('locks title and line items after publication, but allows description and deadline extension only', async () => {
    const buyer = await signIn((await createUser('BUYER')).email);
    const rfq = await publishedRfq(buyer);

    const lockedTitle = await buyer.patch(`/api/v1/rfqs/${rfq.id}`).send({ title: 'A new title' });
    expect(lockedTitle.status).toBe(409);
    expect(lockedTitle.body.error.code).toBe('RFQ_LOCKED');

    const lockedItems = await buyer.patch(`/api/v1/rfqs/${rfq.id}`).send({
      lineItems: [{ name: 'Office chair', quantity: 50, unit: 'pcs' }],
    });
    expect(lockedItems.status).toBe(409);

    const shorten = await buyer.patch(`/api/v1/rfqs/${rfq.id}`).send({ deadline: at(2 * DAY_MS).toISOString() });
    expect(shorten.status).toBe(422);
    expect(shorten.body.error.code).toBe('DEADLINE_CAN_ONLY_EXTEND');

    const extend = await buyer.patch(`/api/v1/rfqs/${rfq.id}`).send({
      deadline: at(14 * DAY_MS).toISOString(),
      description: 'Updated description with more detail on delivery.',
    });
    expect(extend.status).toBe(200);
    expect(extend.body.rfq.description).toContain('Updated description');
  });

  it('hides drafts from vendors and only shows published, open RFQs in discovery', async () => {
    const buyer = await signIn((await createUser('BUYER')).email);
    const vendor = await signIn((await createUser('VENDOR')).email);
    const draft = await buyer.post('/api/v1/rfqs').send(rfqPayload({ title: 'Draft only RFQ' }));
    await publishedRfq(buyer, { title: 'Chairs for Pune warehouse', category: 'Furniture', deliveryLocation: 'Pune' });
    await publishedRfq(buyer, { title: 'Steel rebar for tower B', category: 'Construction', deliveryLocation: 'Hyderabad' });

    expect((await vendor.get(`/api/v1/rfqs/${draft.body.rfq.id}`)).status).toBe(404);

    const all = await vendor.get('/api/v1/rfqs').query({ pageSize: 10 });
    expect(all.body.items.map((r: { title: string }) => r.title)).not.toContain('Draft only RFQ');
    expect(all.body.pagination.total).toBe(2);

    const byKeyword = await vendor.get('/api/v1/rfqs').query({ q: 'rebar' });
    expect(byKeyword.body.items).toHaveLength(1);
    const byCategory = await vendor.get('/api/v1/rfqs').query({ category: 'Furniture' });
    expect(byCategory.body.items.map((r: { deliveryLocation: string }) => r.deliveryLocation)).toEqual(['Pune']);
    const byLocation = await vendor.get('/api/v1/rfqs').query({ location: 'Hyder' });
    expect(byLocation.body.items).toHaveLength(1);
  });

  it('paginates discovery results deterministically', async () => {
    const buyer = await signIn((await createUser('BUYER')).email);
    const vendor = await signIn((await createUser('VENDOR')).email);
    for (let i = 0; i < 5; i += 1) {
      await publishedRfq(buyer, { title: `Bulk RFQ number ${i}`, deadline: at((i + 1) * DAY_MS).toISOString() });
    }
    const page1 = await vendor.get('/api/v1/rfqs').query({ page: 1, pageSize: 2 });
    const page2 = await vendor.get('/api/v1/rfqs').query({ page: 2, pageSize: 2 });
    const page3 = await vendor.get('/api/v1/rfqs').query({ page: 3, pageSize: 2 });
    expect(page1.body.pagination).toMatchObject({ total: 5, totalPages: 3 });
    const titles = [...page1.body.items, ...page2.body.items, ...page3.body.items].map((r: { title: string }) => r.title);
    expect(titles).toEqual([0, 1, 2, 3, 4].map((i) => `Bulk RFQ number ${i}`));

    const bad = await vendor.get('/api/v1/rfqs').query({ pageSize: 500 });
    expect(bad.status).toBe(422);
  });

  it('closes a published RFQ once its deadline passes and records a system-made history entry', async () => {
    const buyer = await signIn((await createUser('BUYER')).email);
    const rfq = await publishedRfq(buyer, { deadline: at(DAY_MS).toISOString() });

    pinClock(at(DAY_MS + 1000));
    const res = await buyer.get(`/api/v1/rfqs/${rfq.id}`);
    expect(res.body.rfq.status).toBe('CLOSED');

    const row = await prisma.statusHistory.findFirst({
      where: { entityId: rfq.id, toStatus: 'CLOSED' },
    });
    expect(row).not.toBeNull();
    expect(row?.actorId).toBeNull();
    expect(row?.fromStatus).toBe('PUBLISHED');
  });

  it('rejects invalid state transitions', async () => {
    const buyer = await signIn((await createUser('BUYER')).email);
    const rfq = await publishedRfq(buyer);
    const again = await buyer.post(`/api/v1/rfqs/${rfq.id}/publish`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');

    const edit = await buyer.patch(`/api/v1/rfqs/${rfq.id}`).send({ description: 'Still editable in published state' });
    expect(edit.status).toBe(200);

    const filtered = await buyer.get('/api/v1/rfqs/mine').query({ status: 'DRAFT' });
    expect(filtered.body.items).toHaveLength(0);
    const published = await buyer.get('/api/v1/rfqs/mine').query({ status: 'PUBLISHED' });
    expect(published.body.items).toHaveLength(1);
  });
});

describe('vendor RFQ discovery and listing edge cases', () => {
  it('treats an invalid status filter as a validation error', async () => {
    await resetDatabase();
    const buyer = await signIn((await createUser('BUYER')).email);
    const res = await buyer.get('/api/v1/rfqs/mine').query({ status: 'SOMETHING' });
    expect(res.status).toBe(422);
  });
});
