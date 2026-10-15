import { describe, expect, it } from 'vitest';
import { lineTotal, money, sumMoney, toApiMoney } from '../src/money.js';
import { buildRevision } from '../src/services/quote.service.js';

describe('decimal-safe money helpers', () => {
  it('avoids binary floating-point error (0.1 + 0.2 is exactly 0.30)', () => {
    const total = sumMoney([money('0.1'), money('0.2')]);
    expect(toApiMoney(total)).toBe('0.30');
  });

  it('multiplies unit price by quantity without rounding drift', () => {
    expect(toApiMoney(lineTotal(money('1999.99'), 3))).toBe('5999.97');
    expect(toApiMoney(lineTotal(money('2000'), 100))).toBe('200000.00');
  });

  it('builds a revision from RFQ line items and computes the total on the server', () => {
    const lines = [
      { id: 'l1', rfqId: 'r', name: 'Office chair', quantity: 100, unit: 'pcs', sortOrder: 0 },
      { id: 'l2', rfqId: 'r', name: 'Standing desk', quantity: 20, unit: 'pcs', sortOrder: 1 },
    ] as any[];
    const built = buildRevision(lines, [
      { rfqLineItemId: 'l1', unitPrice: '1900' },
      { rfqLineItemId: 'l2', unitPrice: '8000' },
    ]);
    expect(toApiMoney(built.total)).toBe('350000.00');
    expect(built.lines.map((l) => toApiMoney(l.lineTotal))).toEqual(['190000.00', '160000.00']);
  });
});
