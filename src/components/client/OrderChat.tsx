import { MessageSquare } from "lucide-react";
import { readOrderMessages } from "@/lib/order-chat";
import { ChatForm } from "@/components/client/ChatForm";
import { cn } from "@/lib/cn";

const time = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Переписка по заказу.
 *
 * Право смотреть проверено страницей - сюда заказ попадает уже своим.
 * Сообщения читаются на сервере, форма отправки живёт в клиентском
 * компоненте: только ей нужно состояние.
 */
export async function OrderChat({
  orderId,
  userId,
}: {
  orderId: number;
  userId: number;
}) {
  const messages = await readOrderMessages(orderId);

  return (
    <div className="rounded-card border border-ink/10 bg-bone/85 p-6 sm:p-7">
      <h2 className="flex items-center gap-2.5 font-display text-xl text-ink">
        <MessageSquare className="size-5 text-brand" aria-hidden />
        Переписка по заказу
      </h2>

      {messages.length === 0 ? (
        <p className="mt-3 text-sm text-ink/55">
          Здесь можно уточнить что угодно по этому заказу - вопрос увидит менеджер,
          который его ведёт.
        </p>
      ) : (
        <ol className="mt-5 flex flex-col gap-3">
          {messages.map((m) => {
            const mine = m.authorId === userId;
            return (
              <li
                key={m.id}
                className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-card px-4 py-3 text-sm whitespace-pre-line",
                    mine ? "bg-brand/12 text-ink" : "bg-ink/6 text-ink",
                  )}
                >
                  {m.message}
                </div>
                <span className="px-1 text-xs text-ink/40">
                  {mine ? "Вы" : `${m.authorName}${m.authorRole !== "user" ? " · БЗК" : ""}`}
                  {m.createdAt && ` · ${time.format(m.createdAt)}`}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-5">
        <ChatForm orderId={orderId} />
      </div>
    </div>
  );
}
