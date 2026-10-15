import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

// Hard safety rule: the suite only ever touches a database whose name ends in _test.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  throw new Error('TEST_DATABASE_URL is not set. Point it at a database whose name ends in _test.');
}
const dbName = decodeURIComponent(new URL(testUrl).pathname.replace(/^\//, ''));
if (!dbName.endsWith('_test')) {
  throw new Error(`Refusing to run tests against "${dbName}". The database name must end in _test.`);
}

process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret-key-that-is-long-enough-for-hs256';
process.env.ADMIN_INVITE_CODE = 'test-admin-invite-code';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `rfq-test-uploads-${process.pid}`);
process.env.MAX_UPLOAD_MB = '1';
process.env.CLOSURE_SWEEP_INTERVAL_MS = '0';
process.env.COOKIE_SECURE = 'false';
process.env.CORS_ORIGIN = 'http://localhost:5173';
