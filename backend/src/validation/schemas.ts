import { z } from 'zod';
import { MAX_QUANTITY, MAX_UNIT_PRICE, MONEY_PATTERN, money } from '../money.js';

// ---- Reusable field types -------------------------------------------------------------

/** Accepts a JSON number or string. Output is a validated decimal string with up to 2 dp. */
const moneyString = (label: string) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .pipe(
      z
        .string()
        .regex(MONEY_PATTERN, `${label} must be a non-negative amount with at most 2 decimals`)
        .refine((s) => money(s).lte(MAX_UNIT_PRICE), `${label} is too large`),
    );

const priceInput = moneyString('Unit price').refine((s) => money(s).gt(0), 'Unit price must be greater than zero');

const budgetInput = moneyString('Budget').refine((s) => money(s).gt(0), 'Budget must be greater than zero');

const isoDate = z
  .string()
  .datetime({ offset: true, message: 'Must be an ISO 8601 date-time such as 2026-11-20T11:30:00+05:30' })
  .transform((s) => new Date(s));

// ---- Auth -----------------------------------------------------------------------------

export const roleSchema = z.enum(['BUYER', 'VENDOR', 'ADMIN']);

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(191),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: roleSchema.default('BUYER'),
  adminInviteCode: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required').max(128),
});

export const adminUserUpdateSchema = z
  .object({
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.isActive !== undefined, 'Provide role or isActive');

// ---- RFQs -----------------------------------------------------------------------------

export const rfqStatusSchema = z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'AWARDED']);

export const lineItemInput = z.object({
  name: z.string().trim().min(1, 'Line item name is required').max(200),
  quantity: z
    .number({ invalid_type_error: 'Quantity must be a whole number' })
    .int('Quantity must be a whole number')
    .min(1, 'Quantity must be at least 1')
    .max(MAX_QUANTITY, `Quantity cannot exceed ${MAX_QUANTITY}`),
  unit: z.string().trim().min(1, 'Unit is required').max(30),
});

const rfqFields = {
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(5000),
  category: z.string().trim().min(2, 'Category is required').max(100),
  deliveryLocation: z.string().trim().min(2, 'Delivery location is required').max(200),
  budget: budgetInput.nullable().optional(),
  deadline: isoDate,
  lineItems: z.array(lineItemInput).max(50, 'An RFQ can have at most 50 line items'),
};

export const rfqCreateSchema = z.object({
  ...rfqFields,
  lineItems: rfqFields.lineItems.default([]),
});

export const rfqUpdateSchema = z.object(rfqFields).partial();

export const idParamSchema = z.object({ id: z.string().min(1).max(191) });

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
};

export const discoveryQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  location: z.string().trim().max(200).optional(),
  deadlineFrom: isoDate.optional(),
  deadlineTo: isoDate.optional(),
  ...pagination,
});

export const buyerRfqQuerySchema = z.object({
  status: rfqStatusSchema.optional(),
  ...pagination,
});

export const adminRfqQuerySchema = z.object({
  status: rfqStatusSchema.optional(),
  buyerId: z.string().min(1).max(191).optional(),
  ...pagination,
});

export const comparisonQuerySchema = z.object({
  sortBy: z.enum(['total', 'deliveryTime']).default('total'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

// ---- Quotes ---------------------------------------------------------------------------

export const quoteLineInput = z.object({
  rfqLineItemId: z.string().min(1).max(191),
  unitPrice: priceInput,
});

export const quoteSubmitSchema = z.object({
  deliveryDays: z
    .number({ invalid_type_error: 'Delivery time must be a whole number of days' })
    .int('Delivery time must be a whole number of days')
    .min(1, 'Delivery time must be at least 1 day')
    .max(365, 'Delivery time cannot exceed 365 days'),
  notes: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  lineItems: z.array(quoteLineInput).min(1, 'Provide a price for each line item').max(50),
});

export const awardSchema = z.object({
  quoteId: z.string().min(1, 'quoteId is required').max(191),
});

// ---- Admin ----------------------------------------------------------------------------

export const adminUserQuerySchema = z.object({
  role: roleSchema.optional(),
  q: z.string().trim().max(100).optional(),
  ...pagination,
});

export const adminQuoteQuerySchema = z.object({
  status: z.enum(['SUBMITTED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED']).optional(),
  rfqId: z.string().min(1).max(191).optional(),
  ...pagination,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RfqCreateInput = z.infer<typeof rfqCreateSchema>;
export type RfqUpdateInput = z.infer<typeof rfqUpdateSchema>;
export type QuoteSubmitInput = z.infer<typeof quoteSubmitSchema>;
export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>;
export type ComparisonQuery = z.infer<typeof comparisonQuerySchema>;
