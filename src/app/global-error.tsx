"use client";

import { useEffect } from "react";

/**
 * Последний рубеж: ошибка в корневом макете.
 *
 * Сюда попадаем, когда не отрисовался даже макет - чаще всего это база,
 * которая не отвечает: шапка витрины читает сессию и корзину. Своих
 * стилей и шрифтов у страницы нет - она заменяет корневой макет целиком,
 * поэтому оформление здесь встроенное, в цветах брендбука, и без
 * картинок, которым тоже может быть неоткуда загрузиться.
 */
export default function GlobalError({
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
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0e1417",
          color: "#f5f3ee",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <title>Сайт временно недоступен · БЗК Принт</title>
        <main style={{ maxWidth: 520, textAlign: "center" }}>
          <p style={{ margin: 0, letterSpacing: "0.3em", fontSize: 13, color: "#3fa294" }}>
            БЗК ПРИНТ
          </p>
          <h1 style={{ margin: "18px 0 0", fontSize: 34, lineHeight: 1.1 }}>
            Сайт на минуту прилёг
          </h1>
          <p style={{ margin: "18px 0 0", color: "rgba(245,243,238,0.7)", lineHeight: 1.6 }}>
            Мы уже видим ошибку. Попробуйте обновить страницу через пару минут, а если
            дело срочное - позвоните: <a href="tel:+79223040465" style={{ color: "#3fa294" }}>+7 922 304-04-65</a>
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 28,
              padding: "12px 26px",
              border: 0,
              borderRadius: 999,
              background: "#2f7d74",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Попробовать ещё раз
          </button>
          {error.digest && (
            <p style={{ marginTop: 22, fontSize: 12, color: "rgba(245,243,238,0.4)" }}>
              Код ошибки: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
