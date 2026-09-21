import { PrismaClient } from "@prisma/client";

// Cached unconditionally (not just outside production) - a warm serverless
// instance reuses this module across invocations, and every additional
// PrismaClient opens its own connection pool. Skipping the cache in
// production was only ever needed to dodge dev's hot-reload duplication;
// in production it just meant more clients (and more DB connections) than
// necessary piling up. See the "too many connections" errors this caused.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

globalForPrisma.prisma = prisma;
