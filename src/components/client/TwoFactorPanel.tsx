"use client";

import { useActionState } from "react";
import { Check, KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  confirmTwoFactor,
  disableTwoFactor,
  startTwoFactor,
  type TwoFactorState,
} from "@/app/actions/two-factor";
import { cn } from "@/lib/cn";
import { siteLabelClass } from "@/components/ui/form-classes";

const initial: TwoFactorState = {};

/**
 * Второй фактор в профиле сотрудника.
 *
 * Три состояния в одном месте: не заведён - заводим, заведён но не
 * подтверждён - показываем QR и ждём код, включён - предлагаем отключить
 * с паролем.
 */
export function TwoFactorPanel({
  enabled,
  hasSecret,
}: {
  enabled: boolean;
  hasSecret: boolean;
}) {
  const [start, startAction, starting] = useActionState(startTwoFactor, initial);
  const [confirm, confirmAction, confirming] = useActionState(
    confirmTwoFactor,
    initial,
  );
  const [off, offAction, disabling] = useActionState(disableTwoFactor, initial);

  // После подтверждения сервер вернул ok - состояние страницы обновится
  // после перезагрузки, но сказать об этом надо сразу
  const isOn = (enabled || confirm.ok) && !off.ok;

  if (isOn) {
    return (
      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-2 text-sm text-ok">
          <ShieldCheck className="size-4 shrink-0" aria-hidden />
          Второй фактор включён - при входе спросим код из приложения.
        </p>

        <form action={offAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>ПАРОЛЬ, ЧТОБЫ ОТКЛЮЧИТЬ</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>КОД ИЗ ПРИЛОЖЕНИЯ</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              className={cn(inputClass, "w-32 font-mono")}
            />
          </label>
          <p className="text-xs text-ink/45">
            После отключения придётся войти заново на всех устройствах.
          </p>
          <button
            type="submit"
            disabled={disabling}
            className="self-start rounded-pill border border-ink/20 px-5 py-2 text-sm text-ink/70 transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
          >
            {disabling ? "Отключаем…" : "Отключить"}
          </button>
          {off.error && (
            <span className="text-sm text-danger" role="status">
              {off.error}
            </span>
          )}
        </form>
      </div>
    );
  }

  // Секрет уже заведён (в этой сессии или раньше) - ждём код
  const secretReady = start.ok || (hasSecret && !enabled);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink/60">
        Одноразовый код из приложения - второе, что спросят при входе, кроме
        пароля. Подойдёт любой аутентификатор: Google Authenticator,
        1Password, Яндекс.Ключ.
      </p>

      {!secretReady && (
        <form action={startAction}>
          <button
            type="submit"
            disabled={starting}
            className="flex items-center gap-2 rounded-pill bg-brand px-5 py-2.5 font-display text-sm tracking-wide text-bone transition-colors hover:bg-brand-bright disabled:opacity-60"
          >
            <KeyRound className="size-4" aria-hidden />
            {starting ? "Готовим…" : "Настроить второй фактор"}
          </button>
          {start.error && (
            <p className="mt-2 flex items-center gap-2 text-sm text-danger" role="status">
              <TriangleAlert className="size-4" aria-hidden />
              {start.error}
            </p>
          )}
        </form>
      )}

      {secretReady && (
        <div className="flex flex-col gap-4">
          {start.qr && (
            <div className="flex flex-wrap items-center gap-5">
              {/* Готовый SVG от генератора: строка собрана из нашего же
                  секрета, разметку из пользовательских данных не строим */}
              <div
                className="shrink-0 rounded-card border border-ink/10 bg-white p-3"
                dangerouslySetInnerHTML={{ __html: start.qr }}
              />
              <div className="min-w-0">
                <p className="text-sm text-ink/60">
                  Отсканируйте код в приложении. Если камеры нет, введите ключ
                  вручную:
                </p>
                <p className="mt-2 break-all font-mono text-sm text-ink">
                  {start.secret}
                </p>
              </div>
            </div>
          )}

          {!start.qr && (
            <p className="text-sm text-warn">
              Секрет уже заведён, но не подтверждён. Введите код из приложения -
              или начните настройку заново после отключения.
            </p>
          )}

          <form action={confirmAction} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>КОД ИЗ ПРИЛОЖЕНИЯ</span>
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                className={cn(inputClass, "w-32 font-mono")}
              />
            </label>
            <button
              type="submit"
              disabled={confirming}
              className="rounded-pill bg-brand px-5 py-2.5 font-display text-sm tracking-wide text-bone transition-colors hover:bg-brand-bright disabled:opacity-60"
            >
              {confirming ? "Проверяем…" : "Включить"}
            </button>
          </form>

          {(confirm.error || confirm.message) && (
            <p
              className={cn(
                "flex items-center gap-2 text-sm",
                confirm.ok ? "text-ok" : "text-danger",
              )}
              role="status"
            >
              {confirm.ok ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <TriangleAlert className="size-4" aria-hidden />
              )}
              {confirm.message ?? confirm.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const labelClass = siteLabelClass;
const inputClass =
  "w-full rounded-card border border-ink/15 bg-bone px-4 py-2.5 text-sm text-ink placeholder:text-ink/35 hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright";
