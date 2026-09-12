import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Пул соединений переживает hot-reload в dev: Next пересоздаёт модули
 * на каждое изменение, и без кэша на globalThis соединения утекают.
 */
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { casing: "snake_case" });
export type Db = typeof db;
