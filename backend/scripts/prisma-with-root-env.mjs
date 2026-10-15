import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoEnvPath = path.resolve(scriptDir, '../../.env');
dotenv.config({ path: repoEnvPath });

if (!process.env.DATABASE_URL) {
  console.error(`DATABASE_URL is missing. Configure it in ${repoEnvPath}.`);
  process.exit(1);
}

const require = createRequire(import.meta.url);
const prismaPackagePath = require.resolve('prisma/package.json');
const prismaCliPath = path.join(path.dirname(prismaPackagePath), 'build/index.js');
const result = spawnSync(process.execPath, [prismaCliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error('Could not launch Prisma CLI:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
