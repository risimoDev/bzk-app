"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import { AdminPage } from "@/components/admin/AdminPage";

/**
 * Ошибка в разделе админки.
 *
 * Меню слева остаётся - оно в макете, - так что можно уйти в соседний
 * раздел, а не перезагружать всё. Сотруднику текст ошибки полезен: он
 * перешлёт его разработчику, поэтому показываем и сообщение, и код.
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
          перешлите разработчику текст ниже.
        </p>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg bg-paper px-3 py-2 font-mono text-xs text-ink/60">
          {error.message || "Без сообщения"}
          {error.digest ? `\nКод: ${error.digest}` : ""}
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
