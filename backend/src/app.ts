import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { openApiSpec } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { adminRouter } from './routes/admin.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { fileRouter } from './routes/file.routes.js';
import { quoteRouter } from './routes/quote.routes.js';
import { rfqRouter } from './routes/rfq.routes.js';

/** Builds the Express application. Kept separate from listen() so tests can use Supertest. */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.NODE_ENV === 'production') app.set('trust proxy', 1);

  // The API serves JSON and files only. The Swagger UI page needs inline scripts, so CSP is off here
  // and the frontend container sets its own Content-Security-Policy.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/api/v1/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'Mini RFQ Portal API' }));

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/rfqs', rfqRouter);
  app.use('/api/v1/quotes', quoteRouter);
  app.use('/api/v1/files', fileRouter);
  app.use('/api/v1/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
