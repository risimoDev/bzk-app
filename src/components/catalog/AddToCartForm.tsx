"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { ShoppingBag } from "lucide-react";
import { addToCart, type CartState } from "@/app/actions/cart";
import { Button } from "@/components/ui/Button";
import { normalizeQuantity, unitPriceFor, type PriceTier } from "@/lib/product-price";
import { nextTierUpsell } from "@/lib/tier-upsell";

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});
const count = new Intl.NumberFormat("ru-RU");

type Option = { valueId: number; value: string; priceModifier: string | null };

const initial: CartState = {};

/** Через сколько гаснет «Добавлено» в плавающей панели, мс. */
const PANEL_MESSAGE_MS = 4000;

// Портал нужен только в браузере: на сервере document нет
const subscribeNothing = () => () => {};

/**
 * Выбор характеристик и количества с расчётом суммы.
 *
 * Сумма считается прямо в браузере той же формулой, что и корзина
 * (`lib/product-price.ts`), поэтому цифра до «В корзину» и после
 * совпадают. Решающий расчёт всё равно делает сервер - здесь только
 * подсказка, отправляется обычная форма.
 *
 * Первое значение каждой характеристики отмечено по умолчанию, иначе
 * можно было бы отправить заказ без выбора, и цена оказалась бы не той,
 * что видел клиент.
 */
export function AddToCartForm({
  productId,
  unit,
  basePrice,
  tiers,
  minQuantity,
  multiplicity,
  attributes,
}: {
  productId: number;
  unit: string;
  basePrice: string;
  tiers: PriceTier[];
  minQuantity: number;
  multiplicity: number;
  attributes: { name: string; values: Option[] }[];
}) {
  const [state, formAction, pending] = useActionState(addToCart, initial);
  const [quantityInput, setQuantityInput] = useState(String(minQuantity));
  const [selected, setSelected] = useState<number[]>(() =>
    attributes.map((a) => a.values[0]?.valueId ?? 0),
  );

  const formRef = useRef<HTMLFormElement>(null);
  const submitRowRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  // Какой ответ сервера с «Добавлено» в панели уже погашен. Панель
  // закрывает половину экрана телефона, и висящее «Добавлено» мешало бы.
  const [dismissedState, setDismissedState] = useState<CartState | null>(null);
  const canPortal = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );

  const surcharge = attributes.reduce((sum, attr, i) => {
    const value = attr.values.find((v) => v.valueId === selected[i]);
    return sum + Number(value?.priceModifier ?? 0);
  }, 0);

  const quantity = normalizeQuantity(Number(quantityInput), minQuantity, multiplicity);
  const unitPrice = unitPriceFor({ basePrice, tiers, quantity, surcharge });
  const total = unitPrice * quantity;
  const adjusted = quantityInput.trim() !== "" && Number(quantityInput) !== quantity;

  // Подсказка про следующую выгодную ступень. Считается теми же функциями,
  // что и корзина, и с теми же надбавками характеристик
  const upsell = nextTierUpsell({
    basePrice,
    tiers,
    quantity,
    minQuantity,
    multiplicity,
    surcharge,
  });

  // Плавающая панель на телефоне появляется, когда блок с кнопкой ушёл из
  // вида. Верхний отступ - под липкую шапку сайта: блок, спрятанный под
  // ней, человеку не виден.
  useEffect(() => {
    const target = submitRowRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPanelVisible(!entry.isIntersecting),
      { rootMargin: "-64px 0px 0px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // Чтобы панель не закрывала конец страницы (подвал, отзывы), даём странице
  // нижний отступ в её высоту. На широком экране панель скрыта (display:none),
  // её высота 0 - и отступ сам обнуляется.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const body = document.body;
    const previous = body.style.paddingBottom;
    const sync = () => {
      const height = panelVisible ? panel.offsetHeight : 0;
      body.style.paddingBottom = height > 0 ? `${height}px` : previous;
    };
    sync();
    const resize = new ResizeObserver(sync);
    resize.observe(panel);
    return () => {
      resize.disconnect();
      body.style.paddingBottom = previous;
    };
  }, [panelVisible, canPortal]);

  useEffect(() => {
    if (!state.ok || !state.message) return;
    const timer = setTimeout(() => setDismissedState(state), PANEL_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  // Ошибка в панели остаётся, пока человек её не исправит; успех гаснет сам
  const panelMessage = state.error
    ? { text: state.error, error: true }
    : state.ok && state.message && dismissedState !== state
      ? { text: state.message, error: false }
      : null;

  const submitLabel = pending ? "Добавляем…" : "В корзину";

  return (
    <form ref={formRef} action={formAction} className="mt-8 flex flex-col gap-6">
      {/* Минимум и шаг сервер берёт из базы по товару - в форму их не кладём */}
      <input type="hidden" name="productId" value={productId} />

      {attributes.map((attr, attrIndex) => (
        <fieldset key={attr.name} className="min-w-0 border-0 p-0">
          <legend className="font-display text-xs tracking-[0.16em] text-ink/45">
            {attr.name}
          </legend>

          {/* Сегменты с переносом строк. Под ними настоящие radio: клавиатура
              (стрелки), чтение с экрана и отправка формы работают как у
              обычной группы переключателей. */}
          <div className="mt-2.5 flex flex-wrap gap-2">
            {attr.values.map((v) => {
              const mod = Number(v.priceModifier ?? 0);
              const id = `attr-${v.valueId}`;
              return (
                <div key={v.valueId} className="relative min-w-0 max-w-full">
                  {/* peer + label: radio остаётся в потоке, но визуально скрыт.

                      Имя у каждой характеристики своё: radio с общим
                      именем образуют ОДНУ группу, и выбрать удалось бы
                      лишь одно значение на весь товар. */}
                  <input
                    type="radio"
                    id={id}
                    name={`attr-${attrIndex}`}
                    value={String(v.valueId)}
                    checked={selected[attrIndex] === v.valueId}
                    onChange={() =>
                      setSelected((prev) =>
                        prev.map((s, i) => (i === attrIndex ? v.valueId : s)),
                      )
                    }
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={id}
                    className="inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-xl border border-ink/15 bg-bone px-4 py-2 text-left text-sm leading-tight text-ink/80 transition-colors hover:border-brand/50 peer-checked:border-brand peer-checked:bg-brand peer-checked:text-bone peer-checked:[&>span:last-child]:bg-bone/20 peer-checked:[&>span:last-child]:text-bone peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-bright"
                  >
                    <span className="min-w-0 break-words">{v.value}</span>
                    {mod !== 0 && (
                      <span className="shrink-0 rounded-md bg-ink/10 px-1.5 py-0.5 font-mono text-xs text-ink/65">
                        {mod > 0 ? "+" : "−"}
                        {money.format(Math.abs(mod))}
                      </span>
                    )}
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="quantity"
          className="font-display text-xs tracking-[0.16em] text-ink/45"
        >
          Количество, {unit}
        </label>
        <input
          id="quantity"
          name="quantity"
          type="number"
          inputMode="numeric"
          min={minQuantity}
          step={multiplicity}
          value={quantityInput}
          onChange={(e) => setQuantityInput(e.target.value)}
          // Уходя из поля, показываем то число, которое реально уйдёт
          // в корзину: так «150» при продаже сотнями не станет сюрпризом
          onBlur={() => setQuantityInput(String(quantity))}
          className="w-36 rounded-xl border border-ink/15 bg-bone px-4 py-3 font-mono text-ink hover:border-ink/30 focus:outline-2 focus:outline-offset-1 focus:outline-brand-bright"
        />
      </div>

      <div
        aria-live="polite"
        className="rounded-card border border-ink/10 bg-bone/80 px-5 py-4"
      >
        <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-display text-xs tracking-[0.16em] text-ink/45">
            ИТОГО ЗА {count.format(quantity)} {unit.toUpperCase()}
          </span>
          <span className="font-mono text-2xl tabular-nums text-ink">
            {money.format(total)}
          </span>
        </p>
        <p className="mt-1 text-sm text-ink/55">
          {money.format(unitPrice)} за {unit}
          {adjusted &&
            (multiplicity > 1
              ? ` · заказ кратен ${multiplicity}, посчитали ${count.format(quantity)}`
              : ` · минимум ${count.format(minQuantity)}`)}
        </p>
      </div>

      {/* Подсказка про больший тираж: только если ступень правда дешевле за
          штуку. Проценты - от цены за штуку, а не от суммы: сумма за больший
          тираж растёт, и «экономия» от неё была бы враньём. */}
      {upsell && (
        <div className="rounded-card border border-brand/25 bg-brand/5 px-5 py-4">
          <p className="text-sm text-ink/60">
            Сейчас: {count.format(upsell.currentQty)} {unit} за{" "}
            {money.format(upsell.currentTotal)} ({money.format(upsell.currentUnit)}/{unit})
          </p>
          <p className="mt-1.5 text-sm text-ink">
            {upsell.extra > 0 ? (
              <>
                За {money.format(upsell.extra)} больше - {count.format(upsell.nextQty)}{" "}
                {unit} по {money.format(upsell.nextUnit)}/{unit}
              </>
            ) : (
              <>
                {count.format(upsell.nextQty)} {unit} по {money.format(upsell.nextUnit)}/
                {unit}, всего {money.format(upsell.nextTotal)}
                {upsell.extra < 0 && <> - на {money.format(-upsell.extra)} меньше, чем сейчас</>}
              </>
            )}
            {upsell.savingPercent !== null && (
              <span className="text-brand">
                {" "}
                · цена за {unit} ниже на {upsell.savingPercent}%
              </span>
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => setQuantityInput(String(upsell.nextQty))}
          >
            Взять {count.format(upsell.nextQty)} {unit}
          </Button>
        </div>
      )}

      <div ref={submitRowRef} className="flex flex-col gap-3">
        <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto sm:self-start">
          <ShoppingBag className="size-5" />
          {submitLabel}
        </Button>

        {/* Отказ сервера: товар сняли с продажи или набор характеристик
            не сошёлся с тем, что сейчас в базе */}
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.ok && state.message && (
          <p role="status" className="text-sm text-ok">
            {state.message}
          </p>
        )}
      </div>

      <p className="text-sm text-ink/50">
        {multiplicity > 1
          ? `Заказ кратен ${multiplicity} ${unit}, минимум - ${minQuantity}.`
          : `Минимальный заказ - ${minQuantity} ${unit}.`}{" "}
        Окончательную сумму подтвердит менеджер, когда посмотрит макет.
      </p>

      {/* Плавающая панель заказа: только телефон (< md). Уходит в body
          порталом - у секции страницы есть mask (рваный край), и она
          обрезала бы fixed-потомка. Кнопка отправляет ТУ ЖЕ форму, а не
          свою копию: те же характеристики, то же количество, тот же
          pending. z-40 - под шапкой сайта (z-50), других fixed-элементов
          на витрине нет. Пока панель скрыта, она невидима и для Tab
          (visibility), иначе фокус уходил бы в «невидимую» кнопку. */}
      {canPortal &&
        createPortal(
          <div
            ref={panelRef}
            aria-hidden={!panelVisible}
            className={`fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-bone/95 px-4 pt-3 shadow-lift backdrop-blur-md md:hidden ${
              panelVisible ? "visible" : "invisible"
            }`}
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            {panelMessage && (
              <p className={`mb-2 text-sm ${panelMessage.error ? "text-danger" : "text-ok"}`}>
                {panelMessage.text}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs text-ink/55">
                  {count.format(quantity)} {unit}
                </p>
                <p className="truncate font-mono text-lg tabular-nums text-ink">
                  {money.format(total)}
                </p>
              </div>
              <Button
                type="button"
                size="md"
                className="shrink-0"
                disabled={pending}
                tabIndex={panelVisible ? 0 : -1}
                onClick={() => formRef.current?.requestSubmit()}
              >
                <ShoppingBag className="size-5" />
                {submitLabel}
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </form>
  );
}
