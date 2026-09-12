"use client";

import { useId, useRef } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Кнопка с подтверждением.
 *
 * Удаление в админке - один клик, и без вопроса это путь потерять платёж
 * или позицию заказа мимоходом, промахнувшись по строке. Спрашиваем
 * своим окном, а не `window.confirm`: системный диалог выглядит чужим,
 * по-разному в разных браузерах и не даёт сказать, что именно пропадёт.
 *
 * Видимая кнопка - всегда `type="button"`, а форму отправляет спрятанная
 * кнопка отправки после подтверждения. Иначе, пока скрипты страницы не
 * загрузились, клик отправлял форму обычным путём - мимо окна: так при
 * проверке на медленной сборке удалилось значение характеристики.
 *
 * Два режима:
 * - без `onConfirm` - внутри формы: после подтверждения нажимается
 *   спрятанная кнопка отправки, и форма уходит обычным путём, вместе с
 *   `useActionState` и состоянием ожидания;
 * - с `onConfirm` - просто вызывает функцию.
 *
 * Окно - встроенный `<dialog>`: он сам ловит фокус, закрывается по Esc и
 * не пускает клики на страницу под собой.
 */
export function ConfirmButton({
  children,
  title,
  text,
  confirmLabel = "Удалить",
  onConfirm,
  disabled,
  className,
  ariaLabel,
  hint,
}: {
  children: React.ReactNode;
  /** Вопрос в окне: «Удалить платёж?» */
  title: string;
  /** Что именно пропадёт и можно ли вернуть */
  text?: string;
  confirmLabel?: string;
  onConfirm?: () => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Всплывающая подсказка у самой кнопки */
  hint?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  function confirm() {
    dialogRef.current?.close();
    if (onConfirm) {
      onConfirm();
      return;
    }
    // Нажимаем кнопку отправки, а не зовём form.requestSubmit(): в React 19
    // программная отправка не всегда доходит до серверного действия,
    // а клик по submit - доходит всегда
    submitRef.current?.click();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        title={hint}
        className={className}
      >
        {children}
      </button>

      {!onConfirm && (
        <button ref={submitRef} type="submit" hidden tabIndex={-1} aria-hidden disabled={disabled} />
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        // Клик по затемнению мимо окна закрывает его: так ведут себя
        // все окна, и иначе кажется, что страница зависла
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-ink/10 bg-bone p-0 text-ink shadow-2xl backdrop:bg-ink/45 backdrop:backdrop-blur-[2px]"
      >
        <div className="p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-danger/10 text-danger">
              <TriangleAlert className="size-4.5" aria-hidden />
            </span>
            <div className="min-w-0 text-left">
              <p id={titleId} className="font-display text-lg leading-tight text-ink">
                {title}
              </p>
              {text && <p className="mt-1.5 text-sm text-ink/60">{text}</p>}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              // Фокус по умолчанию - на отмене: случайный Enter не должен
              // ничего удалять
              autoFocus
              onClick={() => dialogRef.current?.close()}
              className="rounded-lg border border-ink/15 px-4 py-2 text-sm text-ink/75 transition-colors hover:border-ink/30 hover:text-ink focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={confirm}
              className={cn(
                "rounded-lg bg-danger px-4 py-2 text-sm text-bone transition-opacity hover:opacity-90",
                "focus:outline-2 focus:outline-offset-1 focus:outline-danger",
              )}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
