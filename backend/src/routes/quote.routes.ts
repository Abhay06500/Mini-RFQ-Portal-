import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadSingleFile } from '../middleware/upload.js';
import { attachToQuote } from '../services/file.service.js';
import {
  getQuoteForUser,
  getQuoteHistoryForUser,
  listVendorQuotes,
  reviseQuote,
  shortlistQuote,
} from '../services/quote.service.js';
import { parse } from '../validation/parse.js';
import { idParamSchema, quoteSubmitSchema } from '../validation/schemas.js';

export const quoteRouter = Router();
quoteRouter.use(requireAuth);

quoteRouter.get('/mine', requireRole('VENDOR'), async (req, res) => {
  res.json({ items: await listVendorQuotes(req.user!) });
});

quoteRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  res.json({ quote: await getQuoteForUser(req.user!, id) });
});

quoteRouter.put('/:id', requireRole('VENDOR'), async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const input = parse(quoteSubmitSchema, req.body);
  res.json({ quote: await reviseQuote(req.user!, id, input) });
});

quoteRouter.get('/:id/history', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  res.json({ history: await getQuoteHistoryForUser(req.user!, id) });
});

quoteRouter.post('/:id/shortlist', requireRole('BUYER'), async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  res.json({ quote: await shortlistQuote(req.user!, id) });
});

quoteRouter.post('/:id/attachments', requireRole('VENDOR'), uploadSingleFile, async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const attachment = await attachToQuote(req.user!, id, req.file);
  res.status(201).json({ attachment });
});
