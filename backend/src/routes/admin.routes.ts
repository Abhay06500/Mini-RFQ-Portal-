import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listAllRfqs } from '../services/rfq.service.js';
import { listAllQuotes, listUsers, updateUser } from '../services/user.service.js';
import { parse } from '../validation/parse.js';
import {
  adminQuoteQuerySchema,
  adminRfqQuerySchema,
  adminUserQuerySchema,
  adminUserUpdateSchema,
  idParamSchema,
} from '../validation/schemas.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.get('/users', async (req, res) => {
  const q = parse(adminUserQuerySchema, req.query);
  res.json(await listUsers({ role: q.role, q: q.q }, q.page, q.pageSize));
});

adminRouter.patch('/users/:id', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const changes = parse(adminUserUpdateSchema, req.body);
  res.json({ user: await updateUser(req.user!, id, changes) });
});

adminRouter.get('/rfqs', async (req, res) => {
  const q = parse(adminRfqQuerySchema, req.query);
  res.json(await listAllRfqs({ status: q.status, buyerId: q.buyerId }, q.page, q.pageSize));
});

adminRouter.get('/quotes', async (req, res) => {
  const q = parse(adminQuoteQuerySchema, req.query);
  res.json(await listAllQuotes({ status: q.status, rfqId: q.rfqId }, q.page, q.pageSize));
});
