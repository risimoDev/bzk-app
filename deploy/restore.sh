#!/usr/bin/env bash
# ==============================================================================
# BZK PRINT - Скрипт восстановления из резервной копии
# ==============================================================================
# Использование:
#   bash deploy/restore.sh [путь_к_дампу]
#
# Понимает оба формата дампа:
#   *.dump    - формат custom (pg_dump -Fc), так пишет ночной бэкап сейчас;
#   *.sql.gz  - простой SQL в gzip: старые ночные копии, ручные и
#               страховочные перед деплоем.
#
# Восстановление идёт одной транзакцией: схема public пересоздаётся и
# заполняется из дампа. Если что-то сорвалось на середине (битый архив,
# ошибка в SQL), база остаётся такой, какой была до запуска, а не
# наполовину пустой. Ещё до остановки приложения дамп проверяется на
# полноту: пустой или оборванный файл отклоняется сразу. Прерывание
# (Ctrl+C, обрыв ssh) возвращает приложение в работу.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DB_USER="${POSTGRES_USER:-bzk}"
DB_NAME="${POSTGRES_DB:-bzk}"
DUMP_FILE="${1:-}"

# Если файл не передан в аргументах - ищем последние бэкапы
if [ -z "${DUMP_FILE}" ]; then
  echo "=================================================="
  echo " Доступные резервные копии базы данных:"
  echo "=================================================="

  # Находим последние 10 дампов обоих форматов, свежие сверху
  MAPFILE=()
  while IFS= read -r line; do
    MAPFILE+=("$line")
  done < <(find "${ROOT_DIR}/backups" -type f \( -name "*.dump" -o -name "*.sql.gz" \) \
             -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -n 10 | cut -d' ' -f2-)

  if [ ${#MAPFILE[@]} -eq 0 ]; then
    echo "В папке backups/ не найдено дампов базы (*.dump, *.sql.gz)!"
    exit 1
  fi

  for i in "${!MAPFILE[@]}"; do
    FILE="${MAPFILE[$i]}"
    SIZE=$(du -h "${FILE}" | cut -f1)
    MTIME=$(date -r "${FILE}" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || stat -c '%y' "${FILE}" 2>/dev/null | cut -d'.' -f1)
    echo " [$((i + 1))] ${MTIME} - ${FILE#"${ROOT_DIR}/"} (${SIZE})"
  done

  echo ""
  read -rp "Выберите номер бэкапа для восстановления (1-${#MAPFILE[@]}): " CHOICE

  if [[ ! "$CHOICE" =~ ^[0-9]+$ ]] || [ "$CHOICE" -lt 1 ] || [ "$CHOICE" -gt "${#MAPFILE[@]}" ]; then
    echo "Неверный выбор. Отмена."
    exit 1
  fi

  DUMP_FILE="${MAPFILE[$((CHOICE - 1))]}"
fi

if [ ! -f "${DUMP_FILE}" ]; then
  echo "Файл не найден: ${DUMP_FILE}"
  exit 1
fi

case "${DUMP_FILE}" in
  *.dump | *.sql.gz) ;;
  *)
    echo "Неизвестный формат: ${DUMP_FILE}. Ожидается .dump или .sql.gz"
    exit 1
    ;;
esac

# Строка, которой pg_dump заканчивает целый дамп (и pg_restore - вывод
# SQL из формата custom). Нет её - дамп оборван
DUMP_TRAILER='-- PostgreSQL database dump complete'

# Что нужно вернуть на место при любом выходе - в том числе по Ctrl+C или
# при обрыве ssh посреди восстановления. Без этого приложение осталось
# бы остановленным, а сайт - лежать
APP_STOPPED=0
DUMP_COPIED=0
cleanup() {
  if [ "${DUMP_COPIED}" = 1 ]; then
    docker compose exec -T db rm -f /tmp/restore.dump </dev/null >/dev/null 2>&1 || true
    DUMP_COPIED=0
  fi
  if [ "${APP_STOPPED}" = 1 ]; then
    echo "[RESTORE] Запуск контейнера приложения app..."
    docker compose start app || true
    APP_STOPPED=0
  fi
}
trap cleanup EXIT
trap 'echo ""; echo "[RESTORE] Прервано."; exit 130' INT TERM HUP

# Проверка полноты дампа - до подтверждения и до остановки приложения.
# Старый ночной бэкап при упавшем pg_dump записывал целый, но пустой
# .sql.gz; накатить такой - значит получить пустую базу и «успешно»
fail_check() {
  echo "Дамп не годится для восстановления: $1"
  echo "Ничего не изменено - ни база, ни приложение."
  exit 1
}

echo "[RESTORE] Проверка дампа ${DUMP_FILE}..."
case "${DUMP_FILE}" in
  *.sql.gz)
    gzip -t "${DUMP_FILE}" 2>/dev/null || fail_check "архив gzip повреждён или обрезан"
    # Хвост - в переменную: tail дочитывает поток сам, и gunzip не
    # получает SIGPIPE, который pipefail счёл бы ошибкой
    TAIL="$(gunzip -c "${DUMP_FILE}" | tail -n 20)"
    grep -qxF -- "${DUMP_TRAILER}" <<< "${TAIL}" ||
      fail_check "в конце нет строки «${DUMP_TRAILER}» - дамп пустой или оборван"
    ;;
  *.dump)
    # pg_restore читает файл внутри контейнера базы: на сервере его может
    # не быть, а формат custom из конвейера читается не всегда
    docker compose cp "${DUMP_FILE}" db:/tmp/restore.dump || fail_check "не удалось передать файл в контейнер базы"
    DUMP_COPIED=1
    LISTING="$(docker compose exec -T db pg_restore --list /tmp/restore.dump </dev/null 2>/dev/null)" ||
      fail_check "pg_restore не читает оглавление архива"
    grep -q ' TABLE DATA ' <<< "${LISTING}" || fail_check "в архиве нет данных ни одной таблицы"
    # Оглавление лежит в начале файла и обрезанный конец не замечает.
    # Полное чтение в /dev/null проходит по всем блокам данных
    docker compose exec -T db pg_restore -f /dev/null /tmp/restore.dump </dev/null >/dev/null 2>&1 ||
      fail_check "архив обрезан или повреждён (pg_restore не дочитал его до конца)"
    ;;
esac
echo "[RESTORE] Дамп цел."

echo ""
echo "ВНИМАНИЕ! Восстановление базы ПЕРЕЗАПИШЕТ текущие данные в базе '${DB_NAME}'."
echo "Файл восстановления: ${DUMP_FILE}"
echo ""
read -rp "Вы действительно хотите продолжить? Введите 'yes' или 'да': " CONFIRM

if [ "$CONFIRM" != "yes" ] && [ "$CONFIRM" != "да" ]; then
  echo "Операция отменена пользователем."
  exit 0
fi

# Дамп в виде SQL - для любого формата. pg_restore без -d базу не трогает,
# а печатает SQL
dump_sql() {
  case "${DUMP_FILE}" in
    *.dump) docker compose exec -T db pg_restore --no-owner -f - /tmp/restore.dump </dev/null ;;
    *.sql.gz) gunzip -c "${DUMP_FILE}" ;;
  esac
}

# Пропускает SQL насквозь и завершается успехом, только если через поток
# прошла строка окончания дампа. Проверка выше смотрела файл; эта - то,
# что реально ушло в базу
through_trailer() {
  awk -v trailer="${DUMP_TRAILER}" '{ print } $0 == trailer { done = 1 } END { exit !done }'
}

restore_db() {
  # Простой SQL из pg_dump создаёт таблицы, но не удаляет старые: накатить
  # его на живую базу значило бы получить ошибки «уже существует» и
  # дубли строк. Поэтому сначала пересоздаём схему - в той же транзакции,
  # что и загрузка.
  #
  # COMMIT дописываем сами и только если дамп прошёл до строки окончания
  # и ни одна команда конвейера не упала. Флаг psql --single-transaction
  # тут не годится: он фиксирует всё, что пришло, и обрезанный дамп
  # оставил бы базу пустой или наполовину заполненной. Без COMMIT psql на
  # конце ввода закрывает соединение, и транзакция откатывается;
  # ON_ERROR_STOP обрывает её на первой же ошибке
  {
    echo "SET client_min_messages = warning;"
    echo "BEGIN;"
    echo "DROP SCHEMA IF EXISTS public CASCADE;"
    echo "CREATE SCHEMA public;"
    if dump_sql | through_trailer; then
      echo "COMMIT;"
    else
      # Откат явный, а false - чтобы pipefail донёс неудачу до вызывающего
      echo "ROLLBACK;"
      false
    fi
  } | docker compose exec -T db psql -X -q -v ON_ERROR_STOP=1 \
        -U "${DB_USER}" -d "${DB_NAME}" -f - >/dev/null
}

echo "[RESTORE] Остановка контейнера приложения app (чтобы не было активных блокировок)..."
APP_STOPPED=1
docker compose stop app

echo "[RESTORE] Восстановление базы данных из ${DUMP_FILE}..."
if restore_db; then
  RESTORED=1
else
  RESTORED=0
fi

# Приложение поднимаем сразу, не дожидаясь вопроса про файлы
cleanup

if [ "${RESTORED}" -ne 1 ]; then
  echo ""
  echo "[RESTORE] ОШИБКА: восстановление не удалось. Транзакция откатилась -"
  echo "          база осталась в том состоянии, в каком была до запуска."
  exit 1
fi

# Архив файлов того же момента, что и дамп: имена различаются только
# приставкой (bzk-2026-09-06-0300.dump ↔ uploads-2026-09-06-0300.tar.gz).
# Нет такого - предлагаем самый свежий из той же папки
PARENT_DIR="$(dirname "${DUMP_FILE}")"
STAMP="$(basename "${DUMP_FILE}" | sed -E 's/\.(dump|sql\.gz)$//; s/^.*-([0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4,6})$/\1/')"
UPLOADS_ARCHIVE="${PARENT_DIR}/uploads-${STAMP}.tar.gz"
if [ ! -f "${UPLOADS_ARCHIVE}" ]; then
  UPLOADS_ARCHIVE=$(find "${PARENT_DIR}" -maxdepth 1 -name "uploads-*.tar.gz" | sort -r | head -n 1)
fi

if [ -n "${UPLOADS_ARCHIVE}" ] && [ -f "${UPLOADS_ARCHIVE}" ]; then
  echo ""
  read -rp "Обнаружен архив клиентских файлов (${UPLOADS_ARCHIVE}). Восстановить uploads? [y/N]: " RESTORE_UPLOADS
  if [ "$RESTORE_UPLOADS" = "y" ] || [ "$RESTORE_UPLOADS" = "Y" ]; then
    # Ночной архив снят изнутри тома (пути вида ./макет.pdf), ручной из
    # backup-now.sh - с папкой uploads/ впереди. Распаковываем туда, где
    # пути лягут на место
    # Начало оглавления - в переменную: grep -q, закрыв конвейер раньше
    # времени, уронил бы tar по SIGPIPE, и pipefail счёл бы проверку неудачной
    LISTING="$(tar -tzf "${UPLOADS_ARCHIVE}" | awk 'NR <= 50')"
    if grep -qE '^(\./)?uploads/' <<< "${LISTING}"; then
      TARGET=/app/storage
    else
      TARGET=/app/storage/uploads
    fi
    echo "[RESTORE] Восстановление uploads в ${TARGET}..."
    docker compose exec -T app tar -xzf - -C "${TARGET}" < "${UPLOADS_ARCHIVE}"
    echo "[RESTORE] Файлы uploads успешно восстановлены."
  fi
fi

echo ""
echo "=================================================="
echo " База данных успешно восстановлена!"
echo " Проверьте работу сайта: ${SITE_URL:-http://localhost}"
echo "=================================================="
