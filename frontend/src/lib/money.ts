/**
 * Live quotation total shown while a vendor types. This is a preview only. The server recalculates
 * everything on submit, and the stored total is always the server's value.
 *
 * Arithmetic uses integer paise (1/100 rupee) with BigInt, so there is no binary floating-point error.
 */
export const MONEY_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;

export function toPaise(amount: string): bigint | null {
  const trimmed = amount.trim();
  if (!MONEY_PATTERN.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  return BigInt(whole) * 100n + BigInt((frac + '00').slice(0, 2));
}

export function fromPaise(paise: bigint): string {
  const abs = paise < 0n ? -paise : paise;
  const sign = paise < 0n ? '-' : '';
  return `${sign}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** Sum of unit price x quantity across lines. Returns null if any price is not a valid amount. */
export function previewTotal(lines: { unitPrice: string; quantity: number }[]): string | null {
  let total = 0n;
  for (const line of lines) {
    const unit = toPaise(line.unitPrice);
    if (unit === null) return null;
    total += unit * BigInt(line.quantity);
  }
  return fromPaise(total);
}
