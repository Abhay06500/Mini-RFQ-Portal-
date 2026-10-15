import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { at, createUser, DAY_MS, pinClock, publishedRfq, quoteBody, resetDatabase, signIn } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('buyer comparison view and sorting', () => {
  beforeEach(async () => {
    await resetDatabase();
    pinClock(at(0));
  });
  afterEach(() => pinClock(null));

  it('sorts by total and by delivery time, ascending and descending, with a stable tie-break', async () => {
    const buyer = await signIn((await createUser('BUYER')).email);
    const vendors = await Promise.all(
      ['Alpha Office', 'Beta Desks', 'Gamma Supply'].map(async (name) => signIn((await createUser('VENDOR', name)).email)),
    );
    const rfq = await publishedRfq(buyer, { deadline: at(3 * DAY_MS).toISOString() });

    // Totals: Alpha 360000, Beta 350000, Gamma 350000 (tie with Beta). Delivery: Alpha 10, Beta 7, Gamma 7.
    await vendors[0].post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '2000', '8000', 10));
    await vendors[1].post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '1900', '8000', 7));
    await vendors[2].post(`/api/v1/rfqs/${rfq.id}/quotes`).send(quoteBody(rfq, '1900', '8000', 7));

    pinClock(at(4 * DAY_MS));
    const names = (items: any[]) => items.map((i) => i.vendor.name);

    const totalAsc = await buyer.get(`/api/v1/rfqs/${rfq.id}/comparison`).query({ sortBy: 'total', order: 'asc' });
    expect(names(totalAsc.body.items)).toEqual(['Beta Desks', 'Gamma Supply', 'Alpha Office']);

    const totalDesc = await buyer.get(`/api/v1/rfqs/${rfq.id}/comparison`).query({ sortBy: 'total', order: 'desc' });
    expect(names(totalDesc.body.items)).toEqual(['Alpha Office', 'Beta Desks', 'Gamma Supply']);

    const timeAsc = await buyer.get(`/api/v1/rfqs/${rfq.id}/comparison`).query({ sortBy: 'deliveryTime', order: 'asc' });
    expect(names(timeAsc.body.items)).toEqual(['Beta Desks', 'Gamma Supply', 'Alpha Office']);

    const timeDesc = await buyer.get(`/api/v1/rfqs/${rfq.id}/comparison`).query({ sortBy: 'deliveryTime', order: 'desc' });
    expect(names(timeDesc.body.items)[0]).toBe('Alpha Office');
  });

  it('returns an empty list with valid structure when no vendor responded', async () => {
    const buyer = await signIn((await createUser('BUYER')).email);
    const rfq = await publishedRfq(buyer, { deadline: at(DAY_MS).toISOString() });
    pinClock(at(2 * DAY_MS));
    const res = await buyer.get(`/api/v1/rfqs/${rfq.id}/comparison`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.rfq.status).toBe('CLOSED');
  });

  it('hides another buyer\'s comparison entirely', async () => {
    const owner = await signIn((await createUser('BUYER')).email);
    const stranger = await signIn((await createUser('BUYER')).email);
    const rfq = await publishedRfq(owner, { deadline: at(DAY_MS).toISOString() });
    pinClock(at(2 * DAY_MS));
    expect((await stranger.get(`/api/v1/rfqs/${rfq.id}/comparison`)).status).toBe(404);
  });
});
