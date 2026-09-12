/**
 * Готовит фоновое видео обложки: MP4, WebM и кадр-заглушку.
 *
 *   node scripts/optimize-video.mjs
 *
 * Читает assets-src/video/hero.mp4, пишет в public/video/.
 *
 * Исходник с генератора идёт битрейтом около 8 Мбит/с - для петли,
 * которая крутится фоном под текстом и вдобавок размыта, это в разы
 * больше нужного. Звук удаляется совсем: браузеры всё равно не дают
 * автовоспроизведение со звуком, а дорожка занимает место.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";

const SRC = "assets-src/video/hero.mp4";
const OUT = "public/video";

if (!existsSync(SRC)) {
  console.error(`Нет ${SRC}`);
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const run = (args) =>
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], {
    stdio: ["ignore", "inherit", "inherit"],
  });

const mb = (p) => (statSync(p).size / 1048576).toFixed(2);

console.log(`Исходник: ${mb(SRC)} МБ`);

// --- MP4 (H.264): совместим со всем, основной вариант
run([
  "-i", SRC,
  "-an",                          // без звука
  "-c:v", "libx264",
  "-profile:v", "high",
  "-crf", "30",                   // визуально достаточно для размытого фона
  "-maxrate", "1400k",
  "-bufsize", "2800k",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",      // метаданные вперёд: старт без полной загрузки
  `${OUT}/hero.mp4`,
]);
console.log(`hero.mp4:  ${mb(`${OUT}/hero.mp4`)} МБ`);

// --- WebM (VP9): заметно меньше там, где поддерживается
run([
  "-i", SRC,
  "-an",
  "-c:v", "libvpx-vp9",
  "-crf", "36",
  "-b:v", "0",
  "-row-mt", "1",
  "-deadline", "good",
  "-cpu-used", "2",
  `${OUT}/hero.webm`,
]);
console.log(`hero.webm: ${mb(`${OUT}/hero.webm`)} МБ`);

// --- Кадр-заглушка: показывается, пока грузится видео,
//     и вместо него там, где автовоспроизведение запрещено
run([
  "-i", SRC,
  "-vf", "select=eq(n\\,12),scale=1280:-2",
  "-frames:v", "1",
  "-q:v", "6",
  `${OUT}/hero-poster.jpg`,
]);
console.log(`hero-poster.jpg: ${mb(`${OUT}/hero-poster.jpg`)} МБ`);
