import Link from "next/link";
import { Truck } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  CONTRACTOR_STATUS,
  contractorStatusOf,
  contractorTaskNumber,
} from "@/lib/contractor-task";
import { ContractorStatusSelect, MarkSentButton } from "./ContractorControls";

const dtTime = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

export type ContractorGroupItem = {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  status: string;
  statusAt: Date | null;
  dueDate: Date | null;
};

export type ContractorGroup = {
  supplierId: number;
  supplierName: string;
  items: ContractorGroupItem[];
};

/**
 * Подрядчики заказа: по блоку на каждого. Кнопка «Задание подрядчику»
 * открывает печатный лист без данных клиента и без денег; статус работы
 * меняется у каждой позиции отдельно - один подрядчик может сдать часть
 * заказа раньше остального.
 */
export function ContractorSection({
  orderId,
  groups,
  canEdit,
}: {
  orderId: number;
  groups: ContractorGroup[];
  canEdit: boolean;
}) {
  if (groups.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-ink/10 bg-bone">
      <header className="border-b border-ink/10 px-5 py-3">
        <h2 className="font-display text-base text-ink">Подрядчики</h2>
        <p className="mt-0.5 text-xs text-ink/50">
          Задание содержит только позиции, количество и срок - без данных клиента и цен.
        </p>
      </header>

      <div className="divide-y divide-ink/8">
        {groups.map((g) => {
          const unsent = g.items.some((i) => contractorStatusOf(i.status) === "not_sent");
          return (
            <div key={g.supplierId} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-2 text-ink">
                  <Truck className="size-4 text-navy" aria-hidden />
                  {g.supplierName}
                </span>
                <span className="font-mono text-xs text-ink/45">
                  задание {contractorTaskNumber(orderId, g.supplierId)}
                </span>

                <span className="ml-auto flex flex-wrap items-center gap-2">
                  {canEdit && unsent && (
                    <MarkSentButton orderId={orderId} supplierId={g.supplierId} />
                  )}
                  <Link
                    href={`/print/contractor/${orderId}/${g.supplierId}`}
                    target="_blank"
                    className="rounded-lg bg-brand px-3 py-1.5 font-display text-[0.6rem] tracking-wider text-bone hover:bg-brand-bright"
                  >
                    ЗАДАНИЕ ПОДРЯДЧИКУ
                  </Link>
                </span>
              </div>

              <ul className="mt-3 flex flex-col gap-2">
                {g.items.map((i) => {
                  const st = contractorStatusOf(i.status);
                  return (
                    <li
                      key={i.id}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="text-ink/80">{i.name}</span>
                        <span className="ml-2 font-mono text-xs text-ink/45">
                          {i.quantity} {i.unit}
                        </span>
                        {i.dueDate && (
                          <span className="ml-2 text-xs text-ink/45">
                            срок {dayFmt.format(i.dueDate)}
                          </span>
                        )}
                      </span>

                      <span className="flex items-center gap-3">
                        {i.statusAt && (
                          <span className="font-mono text-[0.68rem] text-ink/35">
                            {dtTime.format(i.statusAt)}
                          </span>
                        )}
                        {canEdit ? (
                          <ContractorStatusSelect orderId={orderId} itemId={i.id} status={st} />
                        ) : (
                          <span
                            className={cn(
                              "rounded px-2 py-0.5 font-display text-[0.6rem] tracking-wider",
                              CONTRACTOR_STATUS[st].className,
                            )}
                          >
                            {CONTRACTOR_STATUS[st].label}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
