"use client";

import { useActionState, useCallback, useState, useSyncExternalStore } from "react";

/**
 * Сообщение о результате показывается, только пока это последнее действие
 * на странице.
 *
 * На карточке заказа и финансов десяток независимых форм, и у каждой своё
 * состояние. «Платёж записан» от прежней формы висело бы рядом с результатом
 * следующего действия в другой форме и выглядело бы как его итог. Номер
 * последнего действия общий для всей страницы: форма, которую «перебили»,
 * показывает пустое состояние.
 *
 * Подменяет `useActionState` один в один: те же аргументы, тот же результат.
 */
let latest = 0;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLatestActionState<State, Payload>(
  action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
  initialState: Awaited<State>,
): [state: Awaited<State>, dispatch: (payload: Payload) => void, isPending: boolean] {
  const [state, dispatch, pending] = useActionState(action, initialState);
  const [mine, setMine] = useState(0);
  const current = useSyncExternalStore(
    subscribe,
    () => latest,
    () => 0,
  );

  const run = useCallback(
    (payload: Payload) => {
      latest += 1;
      setMine(latest);
      listeners.forEach((l) => l());
      dispatch(payload);
    },
    [dispatch],
  );

  return [mine === current ? state : initialState, run, pending];
}
