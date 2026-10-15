import fs from 'node:fs/promises';
import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { closeExpiredRfqs } from './services/closure.js';
import { UPLOAD_ROOT } from './services/file.service.js';

async function main(): Promise<void> {
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  const app = createApp();
  const server = app.listen(config.PORT, () => {
    console.log(`Mini RFQ Portal API listening on port ${config.PORT} (docs at /api/docs)`);
  });

  // Background deadline sweeper. Request paths also close expired RFQs, so this is a safety net
  // for RFQs nobody happens to open.
  if (config.CLOSURE_SWEEP_INTERVAL_MS > 0) {
    const timer = setInterval(() => {
      closeExpiredRfqs()
        .then((count) => {
          if (count > 0) console.log(`Closed ${count} RFQ(s) whose deadline passed`);
        })
        .catch((err) => console.error('Deadline sweep failed', err));
    }, config.CLOSURE_SWEEP_INTERVAL_MS);
    timer.unref();
  }

  const shutdown = () => {
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Failed to start the API', err);
  process.exit(1);
});
