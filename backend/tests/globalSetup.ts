import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mariadb from 'mariadb';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.resolve(backendRoot, '../.env') });

/**
 * Before the suite runs, drop and recreate the test database, then apply every versioned
 * migration in order. This uses the same migration.sql files that `prisma migrate deploy`
 * applies, so the tests exercise the real schema.
 */
export default async function setup(): Promise<void> {
  const url = new URL(process.env.TEST_DATABASE_URL ?? '');
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!dbName.endsWith('_test')) {
    throw new Error(`Refusing to reset "${dbName}": the database name must end in _test.`);
  }
  const connection = {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    multipleStatements: true,
    timezone: 'Z',
  };

  const admin = await mariadb.createConnection(connection);
  await admin.query(
    `DROP DATABASE IF EXISTS \`${dbName}\`; CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  );
  await admin.end();

  const db = await mariadb.createConnection({ ...connection, database: dbName });
  const migrationsDir = path.join(backendRoot, 'prisma', 'migrations');
  const folders = (await fs.readdir(migrationsDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const folder of folders) {
    const sql = await fs.readFile(path.join(migrationsDir, folder, 'migration.sql'), 'utf8');
    await db.query(sql);
  }
  await db.end();
}
