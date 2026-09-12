import "server-only";
import { currentUser } from "@/auth";
import { documentsVisibleToClient } from "@/lib/order-documents";
import type { OrderSource } from "@/lib/upd";

/**
 * Кому и когда видны печатные формы заказа.
 *
 * Сотруднику - всегда. Клиенту - только по своему заказу и только после
 * того, как менеджер открыл документы: счёт и УПД выставляются, когда
 * состав и сумма согласованы, а до этого клиент увидел бы черновик и
 * пошёл бы по нему платить.
 */
export type PrintAccess = {
  /** Пускать вообще. */
  allowed: boolean;
  /** Куда вернуться со страницы печати. */
  backHref: string;
  /** Сотрудник - ему видно и то, что клиенту ещё не открыли. */
  isStaff: boolean;
};

export async function orderPrintAccess(
  source: OrderSource,
  orderId: number,
): Promise<PrintAccess> {
  const user = await currentUser();

  const backHref =
    source === "site" ? `/admin/orders/${orderId}` : `/admin/external-orders/${orderId}`;

  if (!user) return { allowed: false, backHref, isStaff: false };

  if (user.role !== "user") {
    return { allowed: true, backHref, isStaff: true };
  }

  const clientBack =
    source === "site"
      ? `/client/orders/${orderId}`
      : `/client/orders/external/${orderId}`;

  const visible = await documentsVisibleToClient(source, orderId, Number(user.id));
  return { allowed: visible, backHref: clientBack, isStaff: false };
}
