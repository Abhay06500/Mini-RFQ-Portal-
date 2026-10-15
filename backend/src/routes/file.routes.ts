import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { authorizeDownload, streamFile } from '../services/file.service.js';
import { parse } from '../validation/parse.js';
import { idParamSchema } from '../validation/schemas.js';

export const fileRouter = Router();
fileRouter.use(requireAuth);

fileRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParamSchema, req.params);
  const file = await authorizeDownload(req.user!, id);
  await streamFile(res, file);
});
