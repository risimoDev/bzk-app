/**
 * Конвертер дампа MySQL (phpMyAdmin) в схему Drizzle для PostgreSQL.
 *
 *   node scripts/generate-schema.mjs ../schema.sql src/db/schema.ts
 *
 * Разовый инструмент: сгенерированный файл дальше правится руками
 * и живёт в репозитории. Перезапускать нужно только если меняется
 * структура старой базы.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("Использование: node generate-schema.mjs <дамп.sql> <выход.ts>");
  process.exit(1);
}

const sql = readFileSync(inputPath, "utf8");

// ---------------------------------------------------------------- разбор

/** @type {Map<string, {columns: any[], pk: string[], unique: any[], indexes: any[], fks: any[], serial: Set<string>}>} */
const tables = new Map();

function table(name) {
  if (!tables.has(name)) {
    tables.set(name, {
      columns: [],
      pk: [],
      unique: [],
      indexes: [],
      fks: [],
      serial: new Set(),
    });
  }
  return tables.get(name);
}

// --- CREATE TABLE
const createRe = /CREATE TABLE `([a-z_0-9]+)` \(\n([\s\S]*?)\n\) ENGINE=/g;
for (const m of sql.matchAll(createRe)) {
  const [, name, body] = m;
  const t = table(name);

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim().replace(/,$/, "");
    const colM = line.match(/^`([a-z_0-9]+)` (.+)$/i);
    if (!colM) continue; // KEY/PRIMARY внутри CREATE - здесь их нет

    const [, col, rest] = colM;
    t.columns.push(parseColumn(name, col, rest));
  }
}

function parseColumn(tableName, col, rest) {
  const notNull = /\bNOT NULL\b/i.test(rest);
  const onUpdateNow = /ON UPDATE CURRENT_TIMESTAMP/i.test(rest);

  const commentM = rest.match(/COMMENT '((?:[^']|'')*)'/i);
  const comment = commentM ? commentM[1].replace(/''/g, "'") : null;

  // DEFAULT снимаем до COMMENT, иначе съедает его текст
  const beforeComment = rest.replace(/\s*COMMENT '(?:[^']|'')*'/i, "");
  let def = null;
  const defM = beforeComment.match(
    /DEFAULT\s+(CURRENT_TIMESTAMP(?:\(\d*\))?|NULL|'(?:[^']|'')*'|[-\d.]+)/i,
  );
  if (defM) def = defM[1];

  const typeM = rest.match(/^([a-z]+)(\(([^)]*)\))?/i);
  const baseType = typeM[1].toLowerCase();
  const typeArg = typeM[3] ?? null;

  return {
    table: tableName,
    name: col,
    baseType,
    typeArg,
    notNull,
    def,
    onUpdateNow,
    comment,
    unsigned: /\bunsigned\b/i.test(rest),
  };
}

// --- ALTER TABLE: ключи и индексы
const alterKeysRe = /ALTER TABLE `([a-z_0-9]+)`\n((?:\s+ADD [^;]*?)+);/g;
for (const m of sql.matchAll(alterKeysRe)) {
  const [, name, body] = m;
  const t = table(name);

  const pkM = body.match(/ADD PRIMARY KEY \(([^)]+)\)/i);
  if (pkM) t.pk = cols(pkM[1]);

  for (const u of body.matchAll(/ADD UNIQUE KEY `([a-z_0-9]+)` \(([^)]+)\)/gi)) {
    t.unique.push({ name: u[1], columns: cols(u[2]) });
  }
  for (const k of body.matchAll(/ADD KEY `([a-z_0-9]+)` \(([^)]+)\)/gi)) {
    t.indexes.push({ name: k[1], columns: cols(k[2]) });
  }
}

// --- ALTER TABLE: AUTO_INCREMENT
for (const m of sql.matchAll(
  /ALTER TABLE `([a-z_0-9]+)`\n\s+MODIFY `([a-z_0-9]+)`[^;]*AUTO_INCREMENT/g,
)) {
  table(m[1]).serial.add(m[2]);
}

// --- ALTER TABLE: внешние ключи
const fkRe =
  /ALTER TABLE `([a-z_0-9]+)`\n((?:\s+ADD CONSTRAINT [^;]*?)+);/g;
for (const m of sql.matchAll(fkRe)) {
  const [, name, body] = m;
  const t = table(name);
  for (const fk of body.matchAll(
    /ADD CONSTRAINT `[a-z_0-9]+` FOREIGN KEY \(([^)]+)\) REFERENCES `([a-z_0-9]+)` \(([^)]+)\)([^,]*)/gi,
  )) {
    t.fks.push({
      columns: cols(fk[1]),
      refTable: fk[2],
      refColumns: cols(fk[3]),
      onDelete: (fk[4].match(/ON DELETE (CASCADE|SET NULL|RESTRICT|NO ACTION)/i) ?? [])[1],
      onUpdate: (fk[4].match(/ON UPDATE (CASCADE|SET NULL|RESTRICT|NO ACTION)/i) ?? [])[1],
    });
  }
}

function cols(s) {
  return s
    .split(",")
    .map((c) => c.trim().replace(/`/g, "").replace(/\(\d+\)$/, ""));
}

// ---------------------------------------------------------------- имена

const camel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const pascal = (s) => {
  const c = camel(s);
  return c[0].toUpperCase() + c.slice(1);
};

/** TS-идентификатор не может начинаться с цифры и не должен совпадать с ключевым словом. */
const RESERVED = new Set(["default", "new", "class", "function", "import", "export"]);
function ident(name) {
  let id = camel(name);
  if (/^\d/.test(id)) id = "t" + id;
  if (RESERVED.has(id)) id += "_";
  return id;
}

// ---------------------------------------------------------------- enum-типы

const enums = new Map(); // имя pgEnum -> {values, varName}
function enumFor(col) {
  const name = `${col.table}_${col.name}`;
  if (!enums.has(name)) {
    const values = col.typeArg
      .split(",")
      .map((v) => v.trim().replace(/^'|'$/g, "").replace(/''/g, "'"));
    enums.set(name, { values, varName: ident(name) + "Enum" });
  }
  return enums.get(name);
}

for (const t of tables.values()) {
  for (const c of t.columns) if (c.baseType === "enum") enumFor(c);
}

// ---------------------------------------------------------------- типы

const imports = new Set(["pgTable", "pgEnum"]);

function columnExpr(col, t) {
  const isSerial = t.serial.has(col.name);
  const q = JSON.stringify(col.name);
  let expr;

  if (isSerial) {
    imports.add("serial");
    expr = `serial(${q})`;
  } else {
    switch (col.baseType) {
      case "int":
      case "mediumint":
      case "smallint":
        imports.add("integer");
        expr = `integer(${q})`;
        break;
      case "bigint":
        imports.add("bigint");
        expr = `bigint(${q}, { mode: "number" })`;
        break;
      case "tinyint":
        // tinyint(1) в MySQL - это булево
        if (col.typeArg === "1") {
          imports.add("boolean");
          expr = `boolean(${q})`;
        } else {
          imports.add("smallint");
          expr = `smallint(${q})`;
        }
        break;
      case "varchar":
      case "char":
        imports.add("varchar");
        expr = `varchar(${q}, { length: ${col.typeArg || 255} })`;
        break;
      case "text":
      case "longtext":
      case "mediumtext":
      case "tinytext":
      case "set": // единственный set: список каналов, храним строкой
        imports.add("text");
        expr = `text(${q})`;
        break;
      case "decimal":
      case "numeric": {
        imports.add("numeric");
        const [p, s] = (col.typeArg ?? "10,2").split(",").map((n) => n.trim());
        expr = `numeric(${q}, { precision: ${p}, scale: ${s} })`;
        break;
      }
      case "float":
      case "double":
        imports.add("doublePrecision");
        expr = `doublePrecision(${q})`;
        break;
      case "timestamp":
        imports.add("timestamp");
        expr = `timestamp(${q}, { withTimezone: true, mode: "date" })`;
        break;
      case "datetime":
        imports.add("timestamp");
        expr = `timestamp(${q}, { mode: "date" })`;
        break;
      case "date":
        // Календарный день, а не момент времени. В режиме "date" драйвер
        // отдаёт и принимает объект Date, а тот берёт день по UTC - в
        // поясе UTC+5 всё, что записано до пяти утра, уезжает на сутки
        // назад. Строка "ГГГГ-ММ-ДД" от часового пояса не зависит.
        imports.add("date");
        expr = `date(${q}, { mode: "string" })`;
        break;
      case "time":
        imports.add("time");
        expr = `time(${q})`;
        break;
      case "json":
        imports.add("jsonb");
        expr = `jsonb(${q})`;
        break;
      case "enum": {
        const e = enumFor(col);
        expr = `${e.varName}(${q})`;
        break;
      }
      default:
        imports.add("text");
        expr = `text(${q}) /* TODO: тип ${col.baseType} перенесён как text */`;
    }
  }

  // Значение по умолчанию
  if (col.def !== null && col.def !== undefined) {
    const d = col.def;
    if (/^CURRENT_TIMESTAMP/i.test(d)) {
      expr += `.defaultNow()`;
    } else if (/^NULL$/i.test(d)) {
      // в Postgres NULL и так по умолчанию
    } else if (col.baseType === "tinyint" && col.typeArg === "1") {
      expr += `.default(${d.replace(/'/g, "") === "0" ? "false" : "true"})`;
    } else {
      const val = /^'/.test(d) ? d.slice(1, -1).replace(/''/g, "'") : d;
      // MySQL кавычит и числовые умолчания ('0'). Для целочисленных
      // колонок Drizzle ждёт число; numeric же представлен строкой.
      const numericColumn = [
        "int",
        "mediumint",
        "smallint",
        "tinyint",
        "bigint",
        "float",
        "double",
      ].includes(col.baseType);

      if (numericColumn && val !== "" && !Number.isNaN(Number(val))) {
        expr += `.default(${Number(val)})`;
      } else {
        expr += `.default(${JSON.stringify(val)})`;
      }
    }
  }

  if (col.notNull && !isSerial) expr += `.notNull()`;
  if (col.onUpdateNow) expr += `.$onUpdate(() => new Date())`;

  return expr;
}

// ---------------------------------------------------------------- вывод

// Таблицы упорядочиваем так, чтобы цель внешнего ключа объявлялась раньше
const order = [];
const seen = new Set();
const visiting = new Set();
function visit(name) {
  if (seen.has(name) || !tables.has(name)) return;
  if (visiting.has(name)) return; // цикл - ссылка разрешится лениво
  visiting.add(name);
  for (const fk of tables.get(name).fks) visit(fk.refTable);
  visiting.delete(name);
  seen.add(name);
  order.push(name);
}
for (const name of [...tables.keys()].sort()) visit(name);

const out = [];

out.push(`/**
 * Схема PostgreSQL, полученная из боевого дампа MySQL.
 *
 * Сгенерировано: scripts/generate-schema.mjs
 * Источник: schema.sql (${tables.size} таблиц, ${[...tables.values()].reduce((n, t) => n + t.fks.length, 0)} внешних ключей)
 *
 * Файл под контролем версий и правится руками - не перезаписывайте
 * генератором, не перенеся правки.
 */
`);

out.push(`import {\n${[...imports].sort().map((i) => `  ${i},`).join("\n")}\n} from "drizzle-orm/pg-core";\n`);

// enum-типы
out.push(`// ============================== Перечисления ==============================\n`);
for (const [name, e] of enums) {
  out.push(
    `export const ${e.varName} = pgEnum(${JSON.stringify(name)}, [${e.values
      .map((v) => JSON.stringify(v))
      .join(", ")}]);`,
  );
}
out.push("");

// таблицы
out.push(`// ================================ Таблицы ================================\n`);

for (const name of order) {
  const t = tables.get(name);
  const varName = ident(name);

  const lines = [];
  for (const col of t.columns) {
    let expr = columnExpr(col, t);

    // Внешний ключ на этой колонке
    const fk = t.fks.find((f) => f.columns.length === 1 && f.columns[0] === col.name);
    if (fk && tables.has(fk.refTable)) {
      const opts = [];
      if (fk.onDelete) opts.push(`onDelete: "${fk.onDelete.toLowerCase().replace(" ", " ")}"`);
      if (fk.onUpdate) opts.push(`onUpdate: "${fk.onUpdate.toLowerCase().replace(" ", " ")}"`);
      const optStr = opts.length ? `, { ${opts.join(", ")} }` : "";
      expr += `.references(() => ${ident(fk.refTable)}.${ident(fk.refColumns[0])}${optStr})`;
    }

    // Первичный ключ из одной колонки
    if (t.pk.length === 1 && t.pk[0] === col.name) expr += `.primaryKey()`;

    const doc = col.comment ? `  /** ${col.comment} */\n` : "";
    lines.push(`${doc}  ${ident(col.name)}: ${expr},`);
  }

  out.push(`export const ${varName} = pgTable(${JSON.stringify(name)}, {`);
  out.push(lines.join("\n"));

  // Составные ключи, уникальные ограничения и индексы
  const extras = [];
  if (t.pk.length > 1) {
    imports.add("primaryKey");
    extras.push(
      `  primaryKey({ columns: [${t.pk.map((c) => `t.${ident(c)}`).join(", ")}] }),`,
    );
  }
  // В Postgres имена индексов глобальные, в MySQL - в пределах таблицы.
  // Без префикса столкнулись бы 14 разных `idx_status`.
  const idxName = (n) => (n.startsWith(name + "_") ? n : `${name}_${n}`);

  // UNIQUE KEY в MySQL - ограничение, а не просто индекс. Важно: на него
  // ссылаются внешние ключи, а ограничение создаётся вместе с таблицей,
  // тогда как уникальный индекс - уже после, и внешний ключ не находит цель.
  for (const u of t.unique) {
    imports.add("unique");
    extras.push(
      `  unique(${JSON.stringify(idxName(u.name))}).on(${u.columns.map((c) => `t.${ident(c)}`).join(", ")}),`,
    );
  }
  for (const idx of t.indexes) {
    imports.add("index");
    extras.push(
      `  index(${JSON.stringify(idxName(idx.name))}).on(${idx.columns.map((c) => `t.${ident(c)}`).join(", ")}),`,
    );
  }
  // Составные внешние ключи
  for (const fk of t.fks) {
    if (fk.columns.length > 1 && tables.has(fk.refTable)) {
      imports.add("foreignKey");
      extras.push(
        `  foreignKey({ columns: [${fk.columns.map((c) => `t.${ident(c)}`).join(", ")}], foreignColumns: [${fk.refColumns.map((c) => `${ident(fk.refTable)}.${ident(c)}`).join(", ")}] }),`,
      );
    }
  }

  if (extras.length) {
    out.push(`}, (t) => [`);
    out.push(extras.join("\n"));
    out.push(`]);\n`);
  } else {
    out.push(`});\n`);
  }
}

// импорты пересобираем в конце: extras могли добавить новые
const body = out.slice(1).join("\n");
const header =
  out[0] +
  `import {\n${[...imports].sort().map((i) => `  ${i},`).join("\n")}\n} from "drizzle-orm/pg-core";\n`;

writeFileSync(outputPath, header + body.replace(/^import \{[\s\S]*?\} from "drizzle-orm\/pg-core";\n/, ""), "utf8");

console.log(`Таблиц:      ${tables.size}`);
console.log(`Перечислений: ${enums.size}`);
console.log(`Внешних ключей: ${[...tables.values()].reduce((n, t) => n + t.fks.length, 0)}`);
console.log(`Записано:    ${outputPath}`);
