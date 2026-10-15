#!/bin/sh
# Container start-up for the API.
# 1. Applies committed Prisma migrations. Safe to run on every start: it only applies pending ones.
# 2. Optionally loads demo data. The seed script is idempotent and does nothing if the demo exists.
# 3. Starts the server. Volumes are never deleted here.
set -eu
cd /app

echo "[api] Applying database migrations"
npx --no-install prisma migrate deploy --schema backend/prisma/schema.prisma

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  echo "[api] Loading demo data (skipped if already present)"
  npx --no-install tsx backend/prisma/seed.ts
fi

echo "[api] Starting server"
exec node backend/dist/server.js
