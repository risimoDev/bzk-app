/**
 * Интроспекция боевой MySQL для переноса.
 * Читает legacy-схему в ./legacy-schema, чтобы сверить её
 * с новой PostgreSQL-моделью. На проде не используется.
 *
 *   npx drizzle-kit pull --config=drizzle.legacy.config.ts
 */
import type { Config } from "drizzle-kit";

export default {
  out: "./legacy-schema",
  dialect: "mysql",
  dbCredentials: { url: process.env.LEGACY_MYSQL_URL! },
  verbose: true,
} satisfies Config;
