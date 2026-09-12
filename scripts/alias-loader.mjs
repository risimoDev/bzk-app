/**
 * Резолвер для проверочных скриптов.
 *
 * Под голым node нет ни псевдонима «@/», ни пакета server-only - оба
 * понимает только сборщик Next. Хук подставляет путь и пустую заглушку,
 * чтобы модули приложения запускались напрямую:
 *
 *   node --experimental-strip-types --import ./scripts/alias-loader.mjs scripts/что-то.mjs
 *
 * На выходе Windows иногда печатает «Assertion failed: !(handle->flags &
 * UV_HANDLE_CLOSING)» - это ругается поток резолвера уже после того, как
 * скрипт отработал и вернул свой код возврата. На результат не влияет.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-hooks.mjs", pathToFileURL("./scripts/"));
