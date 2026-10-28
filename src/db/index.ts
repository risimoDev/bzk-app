import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Пул соединений один на процесс. В dev он переживает hot-reload: Next
 * пересоздаёт модули на каждое изменение, и без кэша на globalThis
 * соединения утекают.
 */
const globalForDb = globalThis as unknown as { pool?: Pool };

function createPool() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    // Простаивающее соединение закрываем раньше, чем его оборвёт Docker/NAT
    // (их таймаут - минуты): иначе первый запрос после простоя падал бы с
    // ECONNRESET на уже мёртвом сокете
    idleTimeoutMillis: 30_000,
    keepAlive: true,
  });

  // Ошибка простаивающего соединения (база перезапустилась, сокет
  // оборвали) приходит событием пула. Без обработчика Node считает его
  // необработанным и роняет процесс. Пул сам выбросит такое соединение и
  // откроет новое при следующем запросе, так что достаточно записать в лог
  pool.on("error", (err) => {
    console.error("[db] ошибка простаивающего соединения:", err.message);
  });

  return pool;
}

const pool = globalForDb.pool ?? createPool();

// Кэшируем и в проде: proxy.ts проверяет товар в базе из своего бандла, и
// без общего пула на globalThis у него вырос бы второй, свой
globalForDb.pool = pool;

export const db = drizzle(pool, { casing: "snake_case" });
export type Db = typeof db;
