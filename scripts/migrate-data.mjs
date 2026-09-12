/**
 * Перенос данных из боевой MySQL в PostgreSQL.
 *
 *   node scripts/migrate-data.mjs            # перенести всё
 *   node scripts/migrate-data.mjs --dry      # только посчитать строки
 *   node scripts/migrate-data.mjs --only=orders,order_items
 *
 * Порядок таблиц берётся из графа внешних ключей самой PostgreSQL,
 * а не задаётся руками: так он не разъедется со схемой.
 *
 * Скрипт идемпотентен - перед переносом чистит целевые таблицы,
 * поэтому его можно гонять сколько угодно раз на копии базы.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import pg from "pg";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const ONLY = argv.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const BATCH = 500;

const { MYSQL_URL, DATABASE_URL } = {
  MYSQL_URL: process.env.LEGACY_MYSQL_URL,
  DATABASE_URL: process.env.DATABASE_URL,
};

if (!MYSQL_URL || !DATABASE_URL) {
  console.error("Нужны LEGACY_MYSQL_URL и DATABASE_URL в .env");
  process.exit(1);
}

const my = await mysql.createConnection({
  uri: MYSQL_URL,
  // Даты берём строками: иначе mysql2 сдвигает их в часовой пояс процесса
  dateStrings: true,
  supportBigNumbers: true,
  bigNumberStrings: true,
});
const pool = new pg.Pool({ connectionString: DATABASE_URL });

// ------------------------------------------------ структура целевой базы

const { rows: colRows } = await pool.query(`
  SELECT table_name, column_name, data_type, ordinal_position
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position
`);

/** таблица -> { колонка -> тип } */
const pgCols = new Map();
for (const r of colRows) {
  if (!pgCols.has(r.table_name)) pgCols.set(r.table_name, new Map());
  pgCols.get(r.table_name).set(r.column_name, r.data_type);
}

const { rows: fkRows } = await pool.query(`
  SELECT c.conrelid::regclass::text AS child,
         c.confrelid::regclass::text AS parent
  FROM pg_constraint c
  WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
`);

// ------------------------------------------------ порядок вставки

const deps = new Map([...pgCols.keys()].map((t) => [t, new Set()]));
for (const { child, parent } of fkRows) {
  if (child !== parent && deps.has(child)) deps.get(child).add(parent);
}

const order = [];
const done = new Set();
const inProgress = new Set();

function visit(t) {
  if (done.has(t) || inProgress.has(t)) return; // цикл разорвём отложенной вставкой
  inProgress.add(t);
  for (const p of deps.get(t) ?? []) visit(p);
  inProgress.delete(t);
  done.add(t);
  order.push(t);
}
for (const t of [...deps.keys()].sort()) visit(t);

const tables = ONLY ? order.filter((t) => ONLY.includes(t)) : order;

// ------------------------------------------------ какие таблицы есть в MySQL

const [myTablesRaw] = await my.query("SHOW TABLES");
const myTables = new Set(myTablesRaw.map((r) => Object.values(r)[0]));

// ------------------------------------------------ преобразование значений

function convert(value, pgType) {
  if (value === null || value === undefined) return null;

  switch (pgType) {
    case "boolean":
      // MySQL хранит tinyint(1): 0/1
      return value === 1 || value === "1" || value === true;

    case "jsonb":
    case "json":
      if (typeof value === "string") return value;
      return JSON.stringify(value);

    case "timestamp with time zone":
    case "timestamp without time zone":
    case "date":
      // dateStrings: приходит "2026-09-04 11:20:00"
      if (value === "0000-00-00 00:00:00" || value === "0000-00-00") return null;
      return value;

    case "integer":
    case "smallint":
    case "bigint": {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }

    default:
      // numeric, text, varchar, enum - отдаём как есть, pg приведёт сам
      return typeof value === "object" && !(value instanceof Date)
        ? JSON.stringify(value)
        : value;
  }
}

// ------------------------------------------------ перенос

const report = [];
let failed = 0;

if (!DRY) {
  // Внешние ключи мешают порядку при повторных запусках - снимаем на время
  await pool.query("SET session_replication_role = 'replica'");
}

for (const table of tables) {
  if (!myTables.has(table)) {
    report.push({ table, source: "-", copied: "-", note: "нет в MySQL" });
    continue;
  }

  const cols = pgCols.get(table);
  const [[row]] = await my.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
  // bigNumberStrings отдаёт COUNT(*) строкой - без приведения итоги
  // в отчёте склеиваются как текст или обнуляются
  const total = Number(row.n);

  if (DRY) {
    report.push({ table, source: total, copied: "-", note: "" });
    continue;
  }

  await pool.query(`TRUNCATE TABLE "${table}" CASCADE`);

  if (total === 0) {
    report.push({ table, source: 0, copied: 0, note: "" });
    continue;
  }

  // Колонки, которые есть и там, и там
  const [myColsRaw] = await my.query(`SHOW COLUMNS FROM \`${table}\``);
  const shared = myColsRaw
    .map((c) => c.Field)
    .filter((name) => cols.has(name));

  const missingInPg = myColsRaw
    .map((c) => c.Field)
    .filter((name) => !cols.has(name));

  let copied = 0;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (let offset = 0; offset < total; offset += BATCH) {
      const [rows] = await my.query(
        `SELECT ${shared.map((c) => `\`${c}\``).join(", ")}
         FROM \`${table}\` LIMIT ${BATCH} OFFSET ${offset}`,
      );
      if (rows.length === 0) break;

      const params = [];
      const tuples = rows.map((row) => {
        const slots = shared.map((c) => {
          params.push(convert(row[c], cols.get(c)));
          return `$${params.length}`;
        });
        return `(${slots.join(", ")})`;
      });

      await client.query(
        `INSERT INTO "${table}" (${shared.map((c) => `"${c}"`).join(", ")})
         VALUES ${tuples.join(", ")}`,
        params,
      );
      copied += rows.length;
    }

    await client.query("COMMIT");
    report.push({
      table,
      source: total,
      copied,
      note: missingInPg.length ? `лишние колонки: ${missingInPg.join(", ")}` : "",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    failed++;
    report.push({ table, source: total, copied: 0, note: `ОШИБКА: ${err.message}` });
  } finally {
    client.release();
  }
}

if (!DRY) {
  await pool.query("SET session_replication_role = 'origin'");

  // Счётчики serial должны продолжиться с максимального id, иначе
  // первая же вставка упрётся в конфликт первичного ключа
  const { rows: seqs } = await pool.query(`
    SELECT c.relname AS seq,
           t.relname AS tbl,
           a.attname AS col
    FROM pg_class c
    JOIN pg_depend d ON d.objid = c.oid AND d.deptype = 'a'
    JOIN pg_class t ON t.oid = d.refobjid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
    WHERE c.relkind = 'S'
  `);
  for (const s of seqs) {
    await pool.query(
      `SELECT setval($1, COALESCE((SELECT MAX("${s.col}") FROM "${s.tbl}"), 0) + 1, false)`,
      [s.seq],
    );
  }
  console.log(`\nСчётчиков обновлено: ${seqs.length}`);
}

// ------------------------------------------------ отчёт

console.log("");
console.log("Таблица".padEnd(34) + "MySQL".padStart(8) + "Скопировано".padStart(13) + "  Примечание");
console.log("-".repeat(96));
let totalSrc = 0;
let totalCopied = 0;
for (const r of report) {
  if (typeof r.source === "number") totalSrc += r.source;
  if (typeof r.copied === "number") totalCopied += r.copied;
  const mark = r.note.startsWith("ОШИБКА") ? " ! " : "   ";
  console.log(
    mark + r.table.padEnd(31) +
      String(r.source).padStart(8) +
      String(r.copied).padStart(13) +
      "  " + r.note,
  );
}
console.log("-".repeat(96));
console.log("   " + "ИТОГО".padEnd(31) + String(totalSrc).padStart(8) + String(totalCopied).padStart(13));

if (failed) console.log(`\nТаблиц с ошибками: ${failed}`);

await my.end();
await pool.end();
process.exit(failed ? 1 : 0);
