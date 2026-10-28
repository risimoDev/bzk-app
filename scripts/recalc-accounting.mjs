/**
 * Пересчёт бухгалтерских карточек по новым правилам.
 *
 *   npm run recalc-accounting              # только отчёт, ничего не пишет
 *   npm run recalc-accounting -- --apply   # записать
 *
 * На сервере - из служебного контейнера (там нет .env, адрес базы в
 * окружении); deploy/deploy.sh делает это сам сразу после drizzle-kit push:
 *   docker compose -f docker-compose.yml -f deploy/compose.tools.yml \
 *     run --rm tools npm run recalc-accounting -- --apply
 *
 * Правила теперь одни на всё приложение (src/lib/order-money-db.ts):
 * расход «факт вытесняет оценку», статус оплаты только из платежей,
 * отменённые заказы вне выручки. Старые карточки считались по-старому, и
 * скрипт приводит их к тем же правилам. Всё - в одной транзакции:
 *
 *  0. Запоминает, какой статус оплаты видели люди: у заказа менеджера -
 *     external_orders.status (его ставил менеджер, а карточку старый код
 *     не трогал), у остальных - статус карточки. Расхождения печатает.
 *  1. Корректировка заказов менеджера: adjustment = итог − сумма позиций,
 *     чтобы после перехода на «итог = позиции + корректировка» ни один
 *     итог не поменялся.
 *  2. Строки «Списано со склада: …» получают признак списания.
 *  3. Оплаченные счета Точки, привязанные к заказу, становятся платежами
 *     (если ещё не стали). Раньше переноса - иначе заказ получил бы и
 *     платёж-перенос на всю сумму, и платёж по счёту.
 *  4. Заказам, которые люди видели оплаченными, а платежей на всю сумму
 *     нет (в старой базе статус ставили руками), - платёж-перенос на
 *     остаток. Иначе «статус только из платежей» превратил бы давно
 *     оплаченные заказы в долги. Отменённым переноса нет - только строка
 *     в отчёте.
 *  5. Каждая карточка пересчитывается сервисом. Итог заказа не
 *     пересобирается, оценка себестоимости считается заново только там,
 *     где её строки нет: иначе история переписалась бы по сегодняшним
 *     ценам материалов. Карточки без заказа помечаются отменёнными.
 *
 * Безопасен к повторному запуску: второй прогон ничего не меняет.
 * Если пересчёт изменил бы итог хоть одного заказа, --apply отказывает
 * (код 2) и печатает список - такие заказы надо разобрать руками.
 */
import { databaseUrl } from "./db-url.mjs";

// В контейнере .env нет - адрес приходит окружением; на машине
// разработчика - наоборот. db-url.mjs знает оба случая
process.env.DATABASE_URL = databaseUrl();

const apply = process.argv.includes("--apply");

const { sql } = await import("drizzle-orm");
const { db } = await import("@/db");
const { recalcCard, applyPaidTochkaInvoice } = await import("@/lib/order-money-db");
const { siteOrderTotal, externalOrderTotal, MONEY_EPS } = await import("@/lib/order-money");
const { parseContact } = await import("@/lib/order-contact");

class DryRun extends Error {}
class Refused extends Error {}

const LEGACY_PAID_NOTE =
  "Перенос из старой базы: заказ был отмечен оплаченным без записи о платеже";

const money = (n) =>
  Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const orderLabel = (r) =>
  r.external_order_id ? `м${r.external_order_id}` : r.order_id ? `с${r.order_id}` : "без заказа";

async function snapshot(tx) {
  const { rows } = await tx.execute(sql`
    select a.id, a.source, a.order_id, a.external_order_id, a.client_name,
           a.income::float8 as income, a.total_expense::float8 as expense,
           a.tax_amount::float8 as tax, a.status, a.is_cancelled
    from orders_accounting a
    order by a.id
  `);
  return new Map(rows.map((r) => [r.id, r]));
}

async function orderTotals(tx) {
  const { rows } = await tx.execute(sql`
    select 'external' as source, id, total_price::float8 as total from external_orders
    union all
    select 'site', id, total_price::float8 from orders
  `);
  return rows;
}

function totals(map, onlyActive) {
  let income = 0, expense = 0, tax = 0, n = 0;
  for (const r of map.values()) {
    if (onlyActive && r.is_cancelled) continue;
    income += r.income;
    expense += r.expense;
    tax += r.tax;
    n++;
  }
  return { n, income, expense, tax, profit: income - expense - tax };
}

const out = [];
const log = (line = "") => out.push(line);
let refusedTotals = [];

try {
  await db.transaction(async (tx) => {
    const before = await snapshot(tx);
    const totalsBefore = await orderTotals(tx);

    // 0. Какой статус видели люди, и отменён ли заказ на самом деле
    const { rows: claimed } = await tx.execute(sql`
      select a.id, a.status as card_status, eo.status as order_status,
             coalesce(eo.status::text, a.status::text) as seen,
             (a.is_cancelled
               or eo.production_status = 'cancelled'
               or o.status = 'cancelled'
               or (a.order_id is null and a.external_order_id is null)) as cancelled,
             a.order_id, a.external_order_id, a.client_name, a.income::float8 as income
      from orders_accounting a
      left join external_orders eo on eo.id = a.external_order_id
      left join orders o on o.id = a.order_id
      order by a.id
    `);
    const mismatched = claimed.filter((r) => r.order_status && r.order_status !== r.card_status);

    // 1. Корректировка = итог − сумма позиций
    const adj = await tx.execute(sql`
      with sums as (
        select eo.id, eo.total_price - coalesce(sum(i.price), 0) as adj
        from external_orders eo
        left join external_order_items i on i.external_order_id = eo.id
        group by eo.id, eo.total_price
      )
      update external_orders eo
      set adjustment = sums.adj,
          adjustment_note = coalesce(eo.adjustment_note,
            case when sums.adj <> 0 then 'Перенесено: итог отличался от суммы позиций' end)
      from sums
      where sums.id = eo.id and eo.adjustment <> sums.adj
      returning eo.id, sums.adj::float8 as adj
    `);

    // 2. Признак списания у строк, которые завело списание со склада
    const wo = await tx.execute(sql`
      update order_expenses set is_write_off = true
      where is_write_off = false
        and material_name is not null
        and description like 'Списано со склада:%'
      returning id
    `);

    // 3. Оплаченные счета Точки без платежа - раньше переноса
    const invoices = await tx.execute(sql`
      select t.id from tochka_invoices t
      where t.payment_status = 'paid' and t.order_id is not null
        and not exists (select 1 from order_payments p where p.tochka_invoice_id = t.id)
    `);
    let tochka = 0;
    for (const inv of invoices.rows) {
      const r = await applyPaidTochkaInvoice(tx, inv.id);
      if (r?.paymentId) tochka++;
    }

    // 4. Перенос: видели «оплачен», а платежей не хватает - на остаток
    const { rows: paidRows } = await tx.execute(sql`
      select order_accounting_id as card, sum(amount)::float8 as paid
      from order_payments group by order_accounting_id
    `);
    const paidOf = new Map(paidRows.map((r) => [r.card, r.paid]));

    const legacy = [];
    const legacySkippedCancelled = [];
    const partialNoPay = [];
    for (const r of claimed) {
      const paid = paidOf.get(r.id) ?? 0;
      if (r.seen === "partial" && paid <= MONEY_EPS) partialNoPay.push(r);
      if (r.seen !== "paid") continue;
      const rest = Math.round((r.income - paid) * 100) / 100;
      if (rest <= MONEY_EPS) continue;
      if (r.cancelled) {
        legacySkippedCancelled.push({ ...r, rest });
        continue;
      }
      await tx.execute(sql`
        insert into order_payments (order_accounting_id, amount, paid_at, payment_date, note)
        select a.id, ${rest.toFixed(2)}::numeric,
               coalesce(eo.created_at, o.created_at, a.created_at),
               coalesce(eo.created_at, o.created_at, a.created_at),
               ${LEGACY_PAID_NOTE}
        from orders_accounting a
        left join external_orders eo on eo.id = a.external_order_id
        left join orders o on o.id = a.order_id
        where a.id = ${r.id}
      `);
      legacy.push({ ...r, rest });
    }

    // 5. Пересчёт каждой карточки. Оценку - только тем, у кого её строки нет
    const { rows: withEstimate } = await tx.execute(sql`
      select distinct order_accounting_id as card from order_expenses
      where description in (
        'Расчётная себестоимость по позициям заказа',
        'Автоматический расчет себестоимости материалов',
        'Автоматический расчет себестоимости материалов (коррекция внеш.)'
      )
    `);
    const hasEstimate = new Set(withEstimate.map((r) => r.card));
    for (const id of before.keys()) {
      await recalcCard(tx, id, { refreshEstimate: !hasEstimate.has(id) });
    }

    const after = await snapshot(tx);

    // Итоги заказов пересчёт не трогает (rebuildTotal выключен). Если
    // хоть один всё же поменялся - что-то не так, записывать нельзя
    const totalsAfter = new Map((await orderTotals(tx)).map((r) => [`${r.source}:${r.id}`, r.total]));
    refusedTotals = totalsBefore
      .map((r) => ({ ...r, after: totalsAfter.get(`${r.source}:${r.id}`) ?? r.total }))
      .filter((r) => Math.abs(r.after - r.total) > MONEY_EPS);

    // Итоги, которые разошлись бы с правилом, если пересобрать их из
    // позиций, - для сведения: сами по себе они не меняются, но
    // поменяются при первой правке позиций такого заказа
    const { rows: siteRows } = await tx.execute(sql`
      select o.id, o.total_price::float8 as total, o.is_urgent, o.contact_info,
             coalesce((select sum(price) from order_items i where i.order_id = o.id), 0)::float8 as items
      from orders o
    `);
    const drift = [];
    for (const o of siteRows) {
      const contact = parseContact(o.contact_info);
      const discount =
        typeof contact?.promo?.discount === "number" ? contact.promo.discount : 0;
      const rule = siteOrderTotal({ subtotal: o.items, urgent: o.is_urgent, discount }).total;
      if (Math.abs(rule - o.total) > MONEY_EPS) drift.push({ label: `с${o.id}`, total: o.total, rule });
    }
    const { rows: extRows } = await tx.execute(sql`
      select eo.id, eo.total_price::float8 as total, eo.adjustment::float8 as adj,
             coalesce((select sum(price) from external_order_items i where i.external_order_id = eo.id), 0)::float8 as items
      from external_orders eo
    `);
    for (const o of extRows) {
      const rule = externalOrderTotal(o.items, o.adj);
      if (Math.abs(rule - o.total) > MONEY_EPS) drift.push({ label: `м${o.id}`, total: o.total, rule });
    }

    // ---------------------------------------------------------- отчёт
    const changed = [];
    for (const [id, b] of before) {
      const a = after.get(id);
      if (!a) continue;
      const diff =
        Math.abs(a.income - b.income) > MONEY_EPS ||
        Math.abs(a.expense - b.expense) > MONEY_EPS ||
        Math.abs(a.tax - b.tax) > MONEY_EPS ||
        a.status !== b.status ||
        a.is_cancelled !== b.is_cancelled;
      if (diff) changed.push({ b, a });
    }

    const pad = (v, n) => String(v).padStart(n);
    const padEnd = (v, n) => String(v).slice(0, n).padEnd(n);
    log(apply ? "РЕЖИМ: --apply (изменения будут записаны)" : "РЕЖИМ: сухой прогон (ничего не записывается)");
    log(`Карточек всего: ${before.size}, изменилось: ${changed.length}`);
    log();

    if (changed.length > 0) {
      log(
        [
          padEnd("карт.", 6),
          padEnd("заказ", 12),
          padEnd("клиент", 22),
          pad("доход было", 13),
          pad("стало", 13),
          pad("расход было", 13),
          pad("стало", 13),
          pad("налог было", 11),
          pad("стало", 11),
          padEnd(" оплата", 17),
          padEnd(" отмена", 9),
        ].join(" "),
      );
      for (const { b, a } of changed) {
        log(
          [
            padEnd(b.id, 6),
            padEnd(orderLabel(b), 12),
            padEnd(b.client_name ?? "-", 22),
            pad(money(b.income), 13),
            pad(money(a.income), 13),
            pad(money(b.expense), 13),
            pad(money(a.expense), 13),
            pad(money(b.tax), 11),
            pad(money(a.tax), 11),
            padEnd(` ${b.status}→${a.status}`, 17),
            padEnd(` ${b.is_cancelled ? "да" : "нет"}→${a.is_cancelled ? "да" : "нет"}`, 9),
          ].join(" "),
        );
      }
    }

    const tb = totals(before, true);
    const ta = totals(after, true);
    log();
    log("Итоги без отменённых (как их видят отчёты):");
    log(`  было:  ${tb.n} карточек, выручка ${money(tb.income)}, расходы ${money(tb.expense)}, налог ${money(tb.tax)}, прибыль ${money(tb.profit)}`);
    log(`  стало: ${ta.n} карточек, выручка ${money(ta.income)}, расходы ${money(ta.expense)}, налог ${money(ta.tax)}, прибыль ${money(ta.profit)}`);

    const cancelled = [...after.values()].filter((r) => r.is_cancelled);
    const orphans = cancelled.filter((r) => !r.order_id && !r.external_order_id);
    log();
    log(`Отменённых карточек: ${cancelled.length} (из них без заказа: ${orphans.length})`);
    for (const r of orphans) {
      log(`  без заказа: карточка ${r.id}, ${r.client_name ?? "-"}, доход ${money(r.income)}, расход ${money(r.expense)}`);
    }

    log();
    log(`Статус заказа менеджера расходится со статусом карточки: ${mismatched.length}`);
    for (const r of mismatched) {
      log(`  карточка ${r.id} (${orderLabel(r)}): заказ «${r.order_status}», карточка «${r.card_status}» - взят статус заказа`);
    }
    log(`Корректировок заказов менеджера записано: ${adj.rows.length}`);
    for (const r of adj.rows) log(`  заказ м${r.id}: ${money(r.adj)}`);
    log(`Строк списания помечено: ${wo.rows.length}`);
    log(`Платежей по оплаченным счетам Точки: ${tochka}`);
    const legacySum = legacy.reduce((s, r) => s + r.rest, 0);
    log(`Платежей-переносов «оплачен без платежа»: ${legacy.length} на ${money(legacySum)}`);
    if (legacySkippedCancelled.length > 0) {
      log(`Отменённые заказы, отмеченные оплаченными без платежа (переноса НЕТ - проверьте, был ли возврат):`);
      for (const r of legacySkippedCancelled) {
        log(`  карточка ${r.id} (${orderLabel(r)}), ${r.client_name ?? "-"}, не хватает ${money(r.rest)}`);
      }
    }
    if (partialNoPay.length > 0) {
      log(`«Частично» без единого платежа (сумма неизвестна - станут неоплаченными, внесите платёж руками):`);
      for (const r of partialNoPay) log(`  карточка ${r.id} (${orderLabel(r)}), ${r.client_name ?? "-"}`);
    }
    log(`Оценка себестоимости посчитана заново (строки не было): ${before.size - [...before.keys()].filter((id) => hasEstimate.has(id)).length} карточек`);

    log(`Итог не совпадает с правилом (не меняется, пересоберётся при правке позиций): ${drift.length}`);
    for (const r of drift) log(`  ${r.label}: сейчас ${money(r.total)}, по позициям ${money(r.rule)}`);

    const [{ debt }] = (
      await tx.execute(sql`
        select coalesce(sum(greatest(a.income - coalesce(p.paid, 0), 0)), 0)::float8 as debt
        from orders_accounting a
        left join (select order_accounting_id card, sum(amount) paid from order_payments group by 1) p
          on p.card = a.id
        where not a.is_cancelled
      `)
    ).rows;
    log(`Долг клиентов после пересчёта (доход − платежи, без отменённых): ${money(debt)}`);

    log(`Изменилось итогов заказов: ${refusedTotals.length}`);
    for (const r of refusedTotals) {
      log(`  ${r.source === "site" ? "с" : "м"}${r.id}: ${money(r.total)} → ${money(r.after)}`);
    }

    if (refusedTotals.length > 0) throw new Refused();
    if (!apply) throw new DryRun();
  });
  console.log(out.join("\n"));
  console.log("\nЗаписано.");
} catch (e) {
  console.log(out.join("\n"));
  if (e instanceof DryRun) {
    console.log("\nСухой прогон: всё откатено. Чтобы записать - добавьте --apply.");
  } else if (e instanceof Refused) {
    console.log(
      "\nОТКАЗ: пересчёт поменял бы итоги заказов выше - ничего не записано.\n" +
        "Итог заказа пересчёт трогать не должен. Сверьте эти заказы руками\n" +
        "(позиции, срочность, скидка, корректировка), поправьте и запустите снова.",
    );
    process.exitCode = 2;
  } else {
    console.error(e);
    process.exitCode = 1;
  }
} finally {
  // Пул соединений держит процесс живым - закрываем сами
  await db.$client.end();
}
