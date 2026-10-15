import { describe, expect, it } from 'vitest';
import { formatINR, fromIstInputValue, toIstInputValue } from './format';
import { fromPaise, previewTotal, toPaise } from './money';

describe('INR formatting', () => {
  it('uses Indian digit grouping and two decimals', () => {
    expect(formatINR('360000.00')).toBe('₹3,60,000.00');
    expect(formatINR('350000')).toBe('₹3,50,000.00');
    expect(formatINR(null)).toBe('—');
  });
});

describe('IST deadline conversion', () => {
  it('shows an instant as IST wall-clock time for the datetime-local input', () => {
    // 2026-11-20T11:30:00Z is 17:00 in IST.
    expect(toIstInputValue('2026-11-20T11:30:00.000Z')).toBe('2026-11-20T17:00');
  });

  it('turns a wall-clock IST entry back into an instant with the +05:30 offset', () => {
    const iso = new Date(fromIstInputValue('2026-11-20T17:00')).toISOString();
    expect(iso).toBe('2026-11-20T11:30:00.000Z');
  });
});

describe('money preview arithmetic', () => {
  it('converts to paise without floating-point error', () => {
    expect(toPaise('0.10')! + toPaise('0.20')!).toBe(30n);
    expect(fromPaise(30n)).toBe('0.30');
  });

  it('computes the same line and quotation totals as the server example', () => {
    const total = previewTotal([
      { unitPrice: '2000', quantity: 100 },
      { unitPrice: '8000', quantity: 20 },
    ]);
    expect(total).toBe('360000.00');
  });

  it('returns null while any price is incomplete or invalid', () => {
    expect(previewTotal([{ unitPrice: '', quantity: 1 }])).toBeNull();
    expect(previewTotal([{ unitPrice: '-5', quantity: 1 }])).toBeNull();
  });
});
