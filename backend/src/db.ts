import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { config } from './config.js';

/**
 * Builds a Prisma client that talks to MySQL through the MariaDB-compatible driver adapter.
 * `timezone: 'Z'` makes the driver read and write DATETIME values as UTC, so deadlines are
 * stored as absolute instants regardless of the server's local timezone.
 */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  const url = new URL(databaseUrl);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    connectionLimit: 10,
    timezone: 'Z',
  });
  return new PrismaClient({ adapter });
}

export const prisma = createPrismaClient(config.DATABASE_URL);
