import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  at,
  createUser,
  DAY_MS,
  PDF_BYTES,
  pinClock,
  publishedRfq,
  quoteBody,
  resetDatabase,
  signIn,
} from './helpers.js';
import { prisma } from '../src/db.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('quotation submission and revision', () => {
  beforeEach(async () => {
    await resetDatabase();
    pinClock(at(0));
  });
  afterEach(() => pinClock(null));

  async function setup() {
    const buyer = await signIn((await createUser('BUYER', 'Acme Constructions')).email);
    const vendorA = await signIn((await createUser('VENDOR', 'OfficeWorld')).email);
    const vendorB = await signIn((await createUser('VENDOR', 'DeskHub')).email);
    const rfq = await publishedRfq(buyer, { deadline: at(7 * DAY_MS).toISOString() });
    return { buyer, vendorA, vendorB, rfq };
  }

  it('calculates line totals and the quotation total on the server (100 x 2000 + 20 x 8000 = 360000)', async () => {
    const { vendorA, rfq } = await setup();
    const res = await vendorA.post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '2000', '8000', 10));
    expect(res.status).toBe(201);
    const rev = res.body.quote.currentRevision;
    expect(rev.totalAmount).toBe('360000.00');
    expect(rev.revisionNumber).toBe(1);
    expect(rev.lineItems.map((l: any) => l.lineTotal)).toEqual(['200000.00', '160000.00']);
    expect(res.body.quote.status).toBe('SUBMITTED');
  });

  it('ignores any client-supplied total: only unit prices are read', async () => {
    const { vendorA, rfq } = await setup();
    const res = await vendorA
      .post(`/api/v1/rfqs/${rfq.id}/quotes`)
      .send({ ...quoteBody(rfq, '2000', '8000'), totalAmount: '1.00' });
    expect(res.status).toBe(201);
    expect(res.body.quote.currentRevision.totalAmount).toBe('360000.00');
  });

  it('rejects missing, negative, and duplicate line prices', async () => {
    const { vendorA, rfq } = await setup();
    const [chair] = rfq.lineItems;

    const missing = await vendorA
      .post(`/api/v1/rfqs/${rfq.id}/quotes`)
      .send({ deliveryDays: 5, lineItems: [{ rfqLineItemId: chair.id, unitPrice: '2000' }] });
    expect(missing.status).toBe(422);
    expect(missing.body.error.code).toBe('QUOTE_INCOMPLETE');

    const negative = await vendorA.post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '-2000', '8000'));
    expect(negative.status).toBe(422);

    const dupes = await vendorA.post(`/api/v1/rfqs/${rfq.id}/quotes`).send({
      deliveryDays: 5,
      lineItems: [
        { rfqLineItemId: chair.id, unitPrice: '2000' },
        { rfqLineItemId: chair.id, unitPrice: '2100' },
      ],
    });
    expect(dupes.status).toBe(422);
  });

  it('allows one quotation per vendor per RFQ', async () => {
    const { vendorA, rfq } = await setup();
    expect((await vendorA.post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '2000', '8000'))).status).toBe(201);
    const second = await vendorA.post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '1800', '7000'));
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('QUOTE_EXISTS');
  });

  it('revises before the deadline, keeps the earlier revision, and uses the latest for comparison', async () => {
    const { buyer, vendorA, rfq } = await setup();
    const first = await vendorA.post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '2000', '8000', 10));
    const quoteId = first.body.quote.id;

    pinClock(at(DAY_MS));
    const revised = await vendorA.put(`/api/v1/quotes/${quoteId}`).send(quoteBody(rfq, '1900', '8000', 10));
    expect(revised.status).toBe(200);
    expect(revised.body.quote.currentRevision.revisionNumber).toBe(2);
    expect(revised.body.quote.currentRevision.totalAmount).toBe('350000.00');

    const detail = await vendorA.get(`/api/v1/quotes/${quoteId}`);
    expect(detail.body.quote.revisions.map((r: any) => [r.revisionNumber, r.totalAmount])).toEqual([
      [1, '360000.00'],
      [2, '350000.00'],
    ]);

    pinClock(at(8 * DAY_MS));
    const comparison = await buyer.get(`/api/v1/rfqs/${rfq.id}/comparison`);
    expect(comparison.body.items[0].currentRevision.totalAmount).toBe('350000.00');
  });

  it('accepts a submission one millisecond before the deadline and rejects one at exactly the deadline', async () => {
    const { vendorA, vendorB, rfq } = await setup();
    const deadline = new Date(rfq.deadline).getTime();

    pinClock(new Date(deadline - 1));
    expect((await vendorA.post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '2000', '8000'))).status).toBe(201);

    pinClock(new Date(deadline));
    const exact = await vendorB.post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '2000', '8000'));
    expect(exact.status).toBe(409);
    expect(exact.body.error.code).toBe('DEADLINE_PASSED');
  });

  it('rejects a late submission and a late revision without changing stored data', async () => {
    const { vendorA, vendorB, rfq } = await setup();
    const created = await vendorA.post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '2000', '8000'));
    const quoteId = created.body.quote.id;
    const before = await prisma.quoteRevision.count({ where: { quoteId } });

    pinClock(at(8 * DAY_MS));
    const late = await vendorB.post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '1000', '1000'));
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('DEADLINE_PASSED');

    const lateRevision = await vendorA.put(`/api/v1/quotes/${quoteId}`).send(quoteBody(rfq, '1000', '1000'));
    expect(lateRevision.status).toBe(409);
    expect(lateRevision.body.error.code).toBe('DEADLINE_PASSED');

    expect(await prisma.quoteRevision.count({ where: { quoteId } })).toBe(before);
    expect(await prisma.quote.count({ where: { rfqId: rfq.id } })).toBe(1);
  });

  it('never shows one vendor another vendor\'s quotation and does not let them change it', async () => {
    const { vendorA, vendorB, rfq } = await setup();
    const quoteA = await vendorA.post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '2000', '8000'));
    const id = quoteA.body.quote.id;

    expect((await vendorB.get(`/api/v1/quotes/${id}`)).status).toBe(404);
    expect((await vendorB.get(`/api/v1/quotes/${id}/history`)).status).toBe(404);
    expect((await vendorB.put(`/api/v1/quotes/${id}`).send(quoteBody(rfq, '1', '1'))).status).toBe(404);

    const rfqDetail = await vendorB.get(`/api/v1/rfqs/${rfq.id}`);
    expect(rfqDetail.body.rfq.myQuote).toBeNull();
    expect(rfqDetail.body.rfq.quoteCount).toBeUndefined();

    const discovery = await vendorB.get('/api/v1/rfqs');
    expect(discovery.body.items[0].myQuote).toBeNull();
    expect(JSON.stringify(discovery.body)).not.toContain(id);
  });

  it('blocks vendors from the buyer comparison and buyers from quotations before closure', async () => {
    const { buyer, vendorA, rfq } = await setup();
    await vendorA.post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '2000', '8000'));
    expect((await vendorA.get(`/api/v1/rfqs/${rfq.id}/comparison`)).status).toBe(403);

    const early = await buyer.get(`/api/v1/rfqs/${rfq.id}/comparison`);
    expect(early.status).toBe(403);
    expect(early.body.error.message).toContain('after the RFQ closes');
  });

  it('attaches a PDF to a quotation and enforces who can download it', async () => {
    const { buyer, vendorA, vendorB, rfq } = await setup();
    const quote = await vendorA.post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '2000', '8000'));
    const id = quote.body.quote.id;

    const upload = await vendorA.post(`/api/v1/quotes/${id}/attachments`).attach('file', PDF_BYTES, {
      filename: 'pricing-breakdown.pdf',
      contentType: 'application/pdf',
    });
    expect(upload.status).toBe(201);
    const fileId = upload.body.attachment.id;

    expect((await vendorA.get(`/api/v1/files/${fileId}`)).status).toBe(200);
    expect((await vendorB.get(`/api/v1/files/${fileId}`)).status).toBe(404);
    expect((await buyer.get(`/api/v1/files/${fileId}`)).status).toBe(404);

    pinClock(at(8 * DAY_MS));
    expect((await buyer.get(`/api/v1/files/${fileId}`)).status).toBe(200);
  });

  it('does not allow a vendor to upload a document after the deadline', async () => {
    const { vendorA, rfq } = await setup();
    const quote = await vendorA.post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '2000', '8000'));
    pinClock(at(8 * DAY_MS));
    const late = await vendorA
      .post(`/api/v1/quotes/${quote.body.quote.id}/attachments`)
      .attach('file', PDF_BYTES, { filename: 'late.pdf', contentType: 'application/pdf' });
    expect(late.status).toBe(409);
  });

  it('exposes a status history for a quotation that starts with SUBMITTED', async () => {
    const { vendorA, rfq } = await setup();
    const quote = await vendorA.post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '2000', '8000'));
    const history = await vendorA.get(`/api/v1/quotes/${quote.body.quote.id}/history`);
    expect(history.body.history).toHaveLength(1);
    expect(history.body.history[0]).toMatchObject({ fromStatus: null, toStatus: 'SUBMITTED' });
  });
});
