import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadSingleFile } from '../middleware/upload.js';
import { awardQuote } from '../services/award.service.js';
import { attachToRfq } from '../services/file.service.js';
import {
  createRfq,
  discoverRfqs,
  getRfqForUser,
  getRfqHistory,
  listBuyerRfqs,
  publishRfq,
  updateRfq,
} from '../services/rfq.service.js';
import { compareQuotes, submitQuote } from '../services/quote.service.js';
import { parse } from '../validation/parse.js';
import {
  awardSchema,
  buyerRfqQuerySchema,
  comparisonQuerySchema,
  discoveryQuerySchema,
  idParamSchema,
  quoteSubmitSchema,
  rfqCreateSchema,
  rfqUpdateSchema,
} from '../validation/schemas.js';

export const rfqRouter = Router();
rfqRouter.use(requireAuth);

// Vendor discovery (published, open RFQs only)
rfqRouter.get('/', requireRole('VENDOR'), async (req, res) => {
  const query = parse(discoveryQuerySchema, req.query);
  res.json(await discoverRfqs(req.user!, query));
});

// Buyer's own RFQs
rfqRouter.get('/mine', requireRole('BUYER'), async (req, res) => {
  const query = parse(buyerRfqQuerySchema, req.query);
  res.json(await listBuyerRfqs(req.user!, query.status, query.page, query.pageSize));
});

rfqRouter.post('/', requireRole('BUYER'), async (req, res) => {
  const input = parse(rfqCreateSchema, req.body);
  res.status(201).json({ rfq: await createRfq(req.user!, input) });
});

rfqRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  res.json({ rfq: await getRfqForUser(req.user!, id) });
});

rfqRouter.patch('/:id', requireRole('BUYER'), async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const input = parse(rfqUpdateSchema, req.body);
  res.json({ rfq: await updateRfq(req.user!, id, input) });
});

rfqRouter.post('/:id/publish', requireRole('BUYER'), async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  res.json({ rfq: await publishRfq(req.user!, id) });
});

rfqRouter.get('/:id/history', requireRole('BUYER', 'ADMIN'), async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  res.json({ history: await getRfqHistory(req.user!, id) });
});

rfqRouter.get('/:id/comparison', requireRole('BUYER', 'ADMIN'), async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const query = parse(comparisonQuerySchema, req.query);
  res.json(await compareQuotes(req.user!, id, query.sortBy, query.order));
});

rfqRouter.post('/:id/award', requireRole('BUYER'), async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const { quoteId } = parse(awardSchema, req.body);
  res.json(await awardQuote(req.user!, id, quoteId));
});

rfqRouter.post('/:id/attachments', requireRole('BUYER'), uploadSingleFile, async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const attachment = await attachToRfq(req.user!, id, req.file);
  res.status(201).json({ attachment });
});

rfqRouter.post('/:id/quotes', requireRole('VENDOR'), async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const input = parse(quoteSubmitSchema, req.body);
  res.status(201).json({ quote: await submitQuote(req.user!, id, input) });
});
