import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL must be set to use Prisma.');

  const url = new URL(databaseUrl);
  if (url.port === '6543') {
    url.searchParams.set('pgbouncer', 'true');
  }
  return url.toString();
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: { db: { url: getDatabaseUrl() } },
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
