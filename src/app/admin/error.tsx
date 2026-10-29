"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import { AdminPage } from "@/components/admin/AdminPage";

/**
 * Ошибка в разделе админки.
 *
 * Меню слева остаётся - оно в макете, - так что можно уйти в соседний
 * раздел, а не перезагружать всё. Сотруднику показываем только код
 * ошибки: он перешлёт его разработчику, а по коду запись находится в логе
 * сервера. Текст ошибки сюда не выводим - в нём бывает запрос к базе с
 * параметрами. В разработке сообщение оставлено: оно нужно, чтобы чинить.
 */
export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AdminPage title="Раздел не открылся">
      <div className="max-w-xl rounded-xl border border-danger/25 bg-danger/5 px-5 py-5">
        <p className="text-sm text-ink/75">
          При загрузке данных случилась ошибка. Попробуйте ещё раз; если повторяется -
          перешлите разработчику код ниже.
        </p>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-paper px-3 py-2 font-mono text-xs text-ink/60">
          {process.env.NODE_ENV === "development" && error.message
            ? `${error.message}\n`
            : ""}
          {error.digest ? `Код: ${error.digest}` : "Кода нет - смотрите лог сервера"}
        </pre>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-4 flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm text-bone transition-colors hover:bg-brand-bright"
        >
          <RotateCw className="size-4" aria-hidden />
          Попробовать ещё раз
        </button>
      </div>
    </AdminPage>
  );
}
