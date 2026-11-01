import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * Our hosted Postgres (Prisma Postgres, free plan) has a low hard cap on
 * concurrent connections, and Prisma's default per-client pool size
 * (`num_cpus * 2 + 1`) blows straight past it under any real concurrency -
 * that's what caused the "too many connections for role" crashes on
 * /deals. `DATABASE_URL` is managed by the Vercel integration and can't be
 * edited directly in the dashboard, so the limit is appended here instead,
 * in code, rather than in the env var itself.
 */
function withConnectionLimit(url: string, limit = 1): string {
  if (/[?&]connection_limit=/.test(url)) return url;
  const withLimit = `${url}${url.includes("?") ? "&" : "?"}connection_limit=${limit}`;
  // Queue for a connection instead of failing immediately when this
  // instance's one connection is already busy (e.g. two Prisma calls
  // in the same request's Promise.all) - a few seconds' wait beats a crash.
  return /[?&]pool_timeout=/.test(withLimit) ? withLimit : `${withLimit}&pool_timeout=20`;
}

/**
 * Password hashes are never read unless asked for by name (login asks with
 * `omit: { passwordHash: false }`) - so a user row passed to a page or a
 * client component can't carry one to the browser by accident.
 */
const OMIT = { user: { passwordHash: true } } as const;

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  return new PrismaClient({ omit: OMIT, ...(databaseUrl ? { datasources: { db: { url: withConnectionLimit(databaseUrl) } } } : {}) });
}
type Db = ReturnType<typeof createPrismaClient>;

// Cached unconditionally (not just outside production) - a warm serverless
// instance reuses this module across invocations, and every additional
// PrismaClient opens its own connection pool. Skipping the cache in
// production was only ever needed to dodge dev's hot-reload duplication;
// in production it just meant more clients (and more DB connections) than
// necessary piling up.
const globalForPrisma = globalThis as unknown as { prisma?: Db };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;
