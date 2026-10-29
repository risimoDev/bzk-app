"use client";

import { useRef, useState } from "react";
import { Search, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { isValidInn, normalizeInn } from "@/lib/inn";
import { PARTY_STATUS_TEXT, partyLabel, type PartyInfo } from "@/lib/dadata-parse";
import { adminInputClass, adminLabelClass } from "@/components/ui/form-classes";

/** Поле формы, которое подсказка умеет заполнить. */
export type InnTarget = {
  /** Атрибут name поля в той же форме. */
  name: string;
  /** Как называть поле в списке «что подставится». */
  label: string;
  /** Что туда класть; null или пусто - поле не трогаем. */
  value: (party: PartyInfo) => string | null | undefined;
};

type Row = {
  target: InnTarget;
  next: string;
  /** Что в поле было, когда пришёл ответ: непусто и иначе - конфликт. */
  current: string;
};

type Field = HTMLInputElement | HTMLTextAreaElement;

function fieldOf(form: HTMLFormElement | null, name: string): Field | null {
  const el = form?.elements.namedItem(name);
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null;
}

/**
 * Значение в поле так, чтобы форма это заметила. Поля в формах то
 * управляемые, то нет; запись через родной сеттер и событие input
 * работает и для тех, и для других. Сами поля и их сохранение формой не
 * меняются - подставляются только значения.
 */
function setFieldValue(el: Field, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Дольше пяти секунд сервера (таймаут DaData) ждать незачем. */
const CLIENT_TIMEOUT_MS = 9000;

/**
 * Кнопка «Заполнить по ИНН» с подтверждением.
 *
 * Запрос уходит только по нажатию: автоподстановка на полную длину ИНН
 * сработала бы раньше, чем человек закончил править поле, и тратила бы
 * платный запрос на каждую промежуточную правку. Найденное сначала
 * показывается («ООО «Ромашка», Пермь»), в форму попадает после
 * «Подставить».
 *
 * Правило подстановки: пустые поля заполняются сразу, а уже заполненные
 * и отличающиеся - только если человек отметил «заменить» у этой строки.
 * Молча затирать то, что он ввёл руками, нельзя, а отказываться заполнять
 * вовсе - значит не помочь тому, кто поправляет старую запись.
 *
 * Рисуется внутри формы. ИНН берётся из поля `innName` этой формы; если
 * в форме ИНН не хранится (подрядчик), компонент показывает собственное
 * поле, которое никуда не отправляется.
 */
export function InnLookup({
  targets,
  innName,
  variant = "admin",
  className,
}: {
  targets: InnTarget[];
  innName?: string;
  variant?: "site" | "admin";
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const ownInnRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [found, setFound] = useState<{ party: PartyInfo; rows: Row[] } | null>(null);
  const [replace, setReplace] = useState<Record<string, boolean>>({});

  const form = () => rootRef.current?.closest("form") ?? null;

  async function lookup() {
    setError(null);
    setDone(null);
    setFound(null);

    const raw = innName ? fieldOf(form(), innName)?.value : ownInnRef.current?.value;
    const inn = normalizeInn(raw ?? "");
    if (!isValidInn(inn)) {
      setError(
        inn === ""
          ? "Впишите ИНН"
          : "ИНН - 10 цифр у организации или 12 у предпринимателя; похоже, в нём опечатка",
      );
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/suggestions/party?inn=${encodeURIComponent(inn)}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      const body: unknown = await res.json().catch(() => null);
      const data = body as { ok?: boolean; message?: string; party?: PartyInfo } | null;

      if (!res.ok || !data?.ok || !data.party) {
        setError(data?.message ?? "Не удалось получить реквизиты. Заполните вручную");
        return;
      }

      const party = data.party;
      const rows: Row[] = [];
      for (const target of targets) {
        const next = target.value(party)?.trim();
        if (!next) continue;
        rows.push({
          target,
          next,
          current: fieldOf(form(), target.name)?.value.trim() ?? "",
        });
      }

      setReplace({});
      setFound({ party, rows });
    } catch {
      setError("Справочник не ответил. Заполните реквизиты вручную");
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (!found) return;

    const filled: string[] = [];
    for (const row of found.rows) {
      const el = fieldOf(form(), row.target.name);
      if (!el) continue;

      // Читаем заново: пока человек смотрел на подтверждение, мог дописать
      const now = el.value.trim();
      if (now === row.next) continue;
      if (now !== "" && !replace[row.target.name]) continue;

      setFieldValue(el, row.next);
      filled.push(row.target.label.toLowerCase());
    }

    setFound(null);
    setDone(
      filled.length > 0
        ? `Подставлено: ${filled.join(", ")}. Проверьте и сохраните форму`
        : "Ничего не изменилось - поля уже заполнены",
    );
  }

  const site = variant === "site";
  const conflicts = found?.rows.filter(
    (r) => r.current !== "" && r.current !== r.next,
  );
  const warn =
    found && found.party.status !== "active" && found.party.status !== "unknown";

  return (
    <div ref={rootRef} className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-end gap-3">
        {!innName && (
          <label className="flex min-w-[12rem] flex-col gap-1.5">
            <span className={adminLabelClass}>ИНН ДЛЯ ПОИСКА</span>
            <input
              ref={ownInnRef}
              inputMode="numeric"
              maxLength={12}
              placeholder="10 или 12 цифр"
              onKeyDown={(e) => {
                // Enter в этом поле не должен отправлять всю форму
                if (e.key === "Enter") {
                  e.preventDefault();
                  void lookup();
                }
              }}
              className={cn(adminInputClass, "font-mono tabular-nums")}
            />
          </label>
        )}

        <button
          type="button"
          onClick={() => void lookup()}
          disabled={loading}
          className={cn(
            "flex items-center gap-2 border border-brand/40 px-4 py-2 font-display text-xs tracking-wider text-brand transition-colors hover:bg-brand/8 disabled:opacity-60",
            site ? "rounded-pill" : "rounded-lg",
          )}
        >
          <Search className="size-3.5" aria-hidden />
          {loading ? "ИЩУ…" : "ЗАПОЛНИТЬ ПО ИНН"}
        </button>
      </div>

      <div aria-live="polite" className="contents">
        {error && (
          <p className="flex items-start gap-2 text-sm text-danger" role="status">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {done && !found && (
          <p className="text-sm text-ok" role="status">
            {done}
          </p>
        )}
      </div>

      {found && (
        <div className="rounded-lg border border-ink/12 bg-paper/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-base text-ink">{partyLabel(found.party)}</p>
              <p className="mt-0.5 text-xs text-ink/50">
                {found.party.kind === "individual" ? "Индивидуальный предприниматель" : "Юридическое лицо"}
                {found.party.manager && found.party.kind === "legal"
                  ? ` · руководитель ${found.party.manager}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFound(null)}
              aria-label="Закрыть"
              className="rounded p-1 text-ink/40 hover:bg-ink/6 hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          {warn && (
            <p
              className="mt-3 flex items-start gap-2 rounded-lg bg-warn/12 px-3 py-2 text-sm text-ink"
              role="alert"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
              {PARTY_STATUS_TEXT[found.party.status]}: проверьте, что с этой
              организацией ещё можно работать и выставлять ей документы.
            </p>
          )}

          {found.rows.length === 0 ? (
            <p className="mt-3 text-sm text-ink/60">
              Для полей этой формы данных нет - заполните вручную.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {found.rows.map((row) => {
                const conflict = row.current !== "" && row.current !== row.next;
                const same = row.current === row.next;
                return (
                  <li key={row.target.name} className="text-sm">
                    <span className="font-display text-[0.62rem] tracking-[0.16em] text-ink/45">
                      {row.target.label.toUpperCase()}
                    </span>
                    <p className="text-ink">{row.next}</p>
                    {same && <p className="text-xs text-ink/45">уже так и записано</p>}
                    {conflict && (
                      <label className="mt-1 flex cursor-pointer items-start gap-2 text-xs text-ink/65">
                        <input
                          type="checkbox"
                          checked={Boolean(replace[row.target.name])}
                          onChange={(e) =>
                            setReplace((r) => ({ ...r, [row.target.name]: e.target.checked }))
                          }
                          className="mt-0.5 size-3.5 accent-brand"
                        />
                        <span>
                          Заменить то, что уже введено: «{row.current}». Без отметки поле
                          останется как есть.
                        </span>
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {found.rows.length > 0 && (
              <button
                type="button"
                onClick={apply}
                className={cn(
                  "bg-brand px-4 py-2 font-display text-xs tracking-wider text-bone hover:bg-brand-bright",
                  site ? "rounded-pill" : "rounded-lg",
                )}
              >
                ПОДСТАВИТЬ
              </button>
            )}
            <button
              type="button"
              onClick={() => setFound(null)}
              className="font-display text-xs tracking-wider text-ink/50 hover:text-ink"
            >
              НЕ НАДО
            </button>
            {conflicts && conflicts.length > 0 && (
              <span className="text-xs text-ink/45">
                Пустые поля заполнятся сами, заполненные - только с отметкой.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
