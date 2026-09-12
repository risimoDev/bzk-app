/**
 * Фоновая петля обложки.
 *
 * Разметка статическая, без клиентского JS: <video> с autoplay/muted/loop
 * браузер отрабатывает сам. Кадр-заглушка лежит фоном на обёртке, а не
 * только в poster - тогда при `prefers-reduced-motion` видео можно просто
 * скрыть в CSS, и на его месте останется картинка, а не пустота.
 *
 * Поверх видео идут два слоя: фактура мятой бумаги, чтобы кадр не выбивался
 * из брендбука, и затемнение - в нижней трети исходника светлая бумага,
 * на ней белый текст не читается.
 */
export function HeroVideo() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden bg-ink bg-cover bg-center"
      style={{ backgroundImage: "url(/video/hero-poster.jpg)" }}
    >
      <video
        className="hero-video absolute inset-0 size-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/video/hero-poster.jpg"
      >
        <source src="/video/hero.webm" type="video/webm" />
        <source src="/video/hero.mp4" type="video/mp4" />
      </video>

      {/* Фактура брендбука поверх кадра */}
      <div className="absolute inset-0 opacity-40 mix-blend-overlay paper-dark" />

      {/* Затемнение под текст: плотнее слева, где стоит заголовок */}
      <div className="absolute inset-0 bg-linear-to-r from-ink via-ink/80 to-ink/25" />
      <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/10 to-ink/55" />
    </div>
  );
}
