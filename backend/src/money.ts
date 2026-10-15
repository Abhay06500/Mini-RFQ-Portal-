import { Prisma } from '@prisma/client';

/**
 * Money is handled with Prisma's Decimal (decimal.js), never with JS floats.
 * Amounts are INR. Stored as DECIMAL(16,2) and serialized to the API as fixed two-decimal strings,
 * so the frontend never has to parse binary floats for money.
 */
export type Money = Prisma.Decimal;

export const money = (value: string | number | Prisma.Decimal): Money => new Prisma.Decimal(value);

/** Line total = unit price x quantity, rounded to paise (2 dp). Always computed on the server. */
export function lineTotal(unitPrice: Money, quantity: number): Money {
  return unitPrice.mul(quantity).toDecimalPlaces(2);
}

export function sumMoney(values: Money[]): Money {
  return values.reduce<Money>((acc, v) => acc.add(v), money(0)).toDecimalPlaces(2);
}

export function toApiMoney(value: Money | string): string {
  return money(value).toFixed(2);
}

/** Largest amount the schema can store (DECIMAL(16,2)) divided by the largest allowed line. */
export const MAX_UNIT_PRICE = '99999999.99';
export const MAX_QUANTITY = 100000;
export const MONEY_PATTERN = /^\d{1,8}(\.\d{1,2})?$/;
