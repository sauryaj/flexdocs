#!/bin/sh
set -e
echo "Running database migrations..."
npx prisma db push --accept-data-loss --skip-generate
echo "Seeding database..."
npx tsx prisma/seed.ts 2>/dev/null || true
npx tsx prisma/seed-orgs.ts 2>/dev/null || true
echo "Init complete!"
