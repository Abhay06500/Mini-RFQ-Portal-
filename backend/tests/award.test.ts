import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, createUser, DAY_MS, pinClock, publishedRfq, quoteBody, resetDatabase, signIn } from './helpers.js';
import { prisma } from '../src/db.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('award workflow', () => {
  beforeEach(async () => {
    await resetDatabase();
    pinClock(at(0));
  });
  afterEach(() => pinClock(null));

  async function closedRfqWithThreeQuotes() {
    const buyer = await signIn((await createUser('BUYER', 'Acme')).email);
    const vendors = await Promise.all(
      ['OfficeWorld', 'DeskHub', 'SeatCraft'].map(async (n) => signIn((await createUser('VENDOR', n)).email)),
    );
    const rfq = await publishedRfq(buyer, { deadline: at(DAY_MS).toISOString() });
    const quotes = [
      await vendors[0].post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '1900', '8000', 10)),
      await vendors[1].post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '2200', '7000', 7)),
      await vendors[2].post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '2500', '9000', 5)),
    ].map((r) => r.body.quote.id as string);
    pinClock(at(2 * DAY_MS));
    return { buyer, vendors, rfq, quotes };
  }

  it('awards one quote: winner ACCEPTED, others REJECTED, RFQ AWARDED, history written', async () => {
    const { buyer, rfq, quotes } = await closedRfqWithThreeQuotes();
    const res = await buyer.post(`/api/v1/rfqs/${rfq.id}/award`).send({ quoteId: quotes[1] });
    expect(res.status).toBe(200);
    expect(res.body.rfq.status).toBe('AWARDED');
    expect(res.body.rfq.awardedQuoteId).toBe(quotes[1]);
    expect(res.body.rejectedQuoteIds.sort()).toEqual([quotes[0], quotes[2]].sort());

    const winner = await prisma.quote.findUnique({ where: { id: quotes[1] } });
    expect(winner?.status).toBe('ACCEPTED');
    const others = await prisma.quote.findMany({ where: { id: { in: [quotes[0], quotes[2]] } } });
    expect(others.every((q) => q.status === 'REJECTED')).toBe(true);

    const rfqHistory = await buyer.get(`/api/v1/rfqs/${rfq.id}/history`);
    const rfqTransition = rfqHistory.body.history.at(-1);
    expect(rfqTransition).toMatchObject({ fromStatus: 'CLOSED', toStatus: 'AWARDED' });
    expect(rfqTransition.actor.id).toBeTruthy();

    const winnerHistory = await prisma.statusHistory.findMany({ where: { entityId: quotes[1], toStatus: 'ACCEPTED' } });
    expect(winnerHistory).toHaveLength(1);
  });

  it('rejects an award while the RFQ is still published', async () => {
    const buyer = await signIn((await createUser('BUYER')).email);
    const vendor = await signIn((await createUser('VENDOR')).email);
    const rfq = await publishedRfq(buyer, { deadline: at(DAY_MS).toISOString() });
    const quote = await vendor.post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '2000', '8000'));
    const res = await buyer.post(`/api/v1/rfqs/${rfq.id}/award`).send({ quoteId: quote.body.quote.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RFQ_NOT_CLOSED');
  });

  it('rejects awarding a quotation that belongs to a different RFQ', async () => {
    const { buyer, rfq } = await closedRfqWithThreeQuotes();
    const otherBuyer = await signIn((await createUser('BUYER')).email);
    const otherRfq = await publishedRfq(otherBuyer, { deadline: at(10 * DAY_MS).toISOString() });
    const vendor = await signIn((await createUser('VENDOR')).email);
    const foreign = await vendor.post(`/api/v1/rfqs/${otherRfq.id}/quotes`).send(quoteBody(otherRfq, '2000', '8000'));
    const res = await buyer.post(`/api/v1/rfqs/${rfq.id}/award`).send({ quoteId: foreign.body.quote.id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('QUOTE_NOT_IN_RFQ');
  });

  it('refuses a second award for the same RFQ', async () => {
    const { buyer, rfq, quotes } = await closedRfqWithThreeQuotes();
    expect((await buyer.post(`/api/v1/rfqs/${rfq.id}/award`).send({ quoteId: quotes[0] })).status).toBe(200);
    const again = await buyer.post(`/api/v1/rfqs/${rfq.id}/award`).send({ quoteId: quotes[2] });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('RFQ_ALREADY_AWARDED');
    expect(await prisma.quote.count({ where: { rfqId: rfq.id, status: 'ACCEPTED' } })).toBe(1);
  });

  it('lets only one of two simultaneous awards succeed and never produces two winners', async () => {
    const { buyer, rfq, quotes } = await closedRfqWithThreeQuotes();
    const [a, b] = await Promise.all([
      buyer.post(`/api/v1/rfqs/${rfq.id}/award`).send({ quoteId: quotes[0] }),
      buyer.post(`/api/v1/rfqs/${rfq.id}/award`).send({ quoteId: quotes[1] }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(await prisma.quote.count({ where: { rfqId: rfq.id, status: 'ACCEPTED' } })).toBe(1);
    const rfq2 = await prisma.rfq.findUnique({ where: { id: rfq.id } });
    expect(rfq2?.status).toBe('AWARDED');
  });

  it('does not let a different buyer award the RFQ', async () => {
    const { rfq, quotes } = await closedRfqWithThreeQuotes();
    const intruder = await signIn((await createUser('BUYER')).email);
    const res = await intruder.post(`/api/v1/rfqs/${rfq.id}/award`).send({ quoteId: quotes[0] });
    expect(res.status).toBe(404);
    expect((await prisma.rfq.findUnique({ where: { id: rfq.id } }))?.status).toBe('CLOSED');
  });

  it('rejects a vendor trying to award', async () => {
    const { vendors, rfq, quotes } = await closedRfqWithThreeQuotes();
    const res = await vendors[0].post(`/api/v1/rfqs/${rfq.id}/award`).send({ quoteId: quotes[0] });
    expect(res.status).toBe(403);
  });

  it('shortlists a quotation after closure and records the change', async () => {
    const { buyer, rfq, quotes } = await closedRfqWithThreeQuotes();
    const res = await buyer.post(`/api/v1/quotes/${quotes[2]}/shortlist`);
    expect(res.status).toBe(200);
    expect(res.body.quote.status).toBe('SHORTLISTED');
    const award = await buyer.post(`/api/v1/rfqs/${rfq.id}/award`).send({ quoteId: quotes[2] });
    expect(award.status).toBe(200);
  });
});
