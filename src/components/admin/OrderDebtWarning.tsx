import { DebtWarning } from "@/components/admin/DebtWarning";
import { can } from "@/lib/permissions";
import { partyHref } from "@/lib/debts";
import { overdueDebtOf, partyKeyForExternal, partyKeyForUser } from "@/lib/debts-db";

/**
 * Предупреждение о просроченном долге клиента для карточки заказа.
 *
 * Самодостаточный серверный компонент: сам определяет плательщика (аккаунт
 * сайта, контрагент или имя из заказа менеджера), сам читает долг и сам
 * решает, давать ли ссылку на страницу долгов и показывать ли сумму (нужно
 * право смотреть финансы; без него - только факт долга). В карточку заказа достаточно поставить одну строку. Ничего не
 * блокирует и клиенту ничего не отправляет.
 */
export async function OrderDebtWarning(
  props:
    | { source: "site"; userId: number | null }
    | { source: "external"; clientId: number | null; clientName: string | null },
) {
  const partyKey =
    props.source === "site"
      ? props.userId !== null
        ? await partyKeyForUser(props.userId)
        : null
      : partyKeyForExternal(props.clientId, props.clientName);
  if (!partyKey) return null;

  const info = await overdueDebtOf(partyKey);
  if (!info) return null;

  const canFinance = await can("finance", "view");
  return (
    <DebtWarning
      info={canFinance ? info : { n: info.n }}
      href={canFinance ? partyHref(partyKey) : undefined}
      className="mb-5"
    />
  );
}
