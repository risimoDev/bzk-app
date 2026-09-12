#!/usr/bin/env bash
# ==============================================================================
# BZK PRINT - Скрипт восстановления из резервной копии
# ==============================================================================
# Использование:
#   bash deploy/restore.sh [путь_к_файлу.sql.gz]
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

DUMP_FILE="${1:-}"

# Если файл не передан в аргументах - ищем последние бэкапы
if [ -z "${DUMP_FILE}" ]; then
  echo "=================================================="
  echo " Доступные резервные копии базы данных:"
  echo "=================================================="
  
  # Находим последние 10 дампов
  MAPFILE=()
  while IFS= read -r line; do
    MAPFILE+=("$line")
  done < <(find "${ROOT_DIR}/backups" -type f -name "*.sql.gz" | sort -r | head -n 10)

  if [ ${#MAPFILE[@]} -eq 0 ]; then
    echo "В папке backups/ не найдено дампов базы (*.sql.gz)!"
    exit 1
  fi

  for i in "${!MAPFILE[@]}"; do
    FILE="${MAPFILE[$i]}"
    SIZE=$(du -h "${FILE}" | cut -f1)
    MTIME=$(date -r "${FILE}" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || stat -c '%y' "${FILE}" 2>/dev/null | cut -d'.' -f1)
    echo " [$((i + 1))] ${MTIME} - $(basename "${FILE}") (${SIZE})"
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

echo ""
echo "ВНИМАНИЕ! Восстановление базы ПЕРЕЗАПИШЕТ текущие данные в базе '${POSTGRES_DB:-bzk}'."
echo "Файл восстановления: ${DUMP_FILE}"
echo ""
read -rp "Вы действительно хотите продолжить? Введите 'yes' или 'да': " CONFIRM

if [ "$CONFIRM" != "yes" ] && [ "$CONFIRM" != "да" ]; then
  echo "Операция отменена пользователем."
  exit 0
fi

echo "[RESTORE] Остановка контейнера приложения app (чтобы не было активных блокировок)..."
docker compose stop app

echo "[RESTORE] Восстановление базы данных из ${DUMP_FILE}..."
gunzip -c "${DUMP_FILE}" | docker compose exec -T db psql -U "${POSTGRES_USER:-bzk}" -d "${POSTGRES_DB:-bzk}"

echo "[RESTORE] Запуск контейнера приложения app..."
docker compose start app

# Проверка файлов uploads
PARENT_DIR="$(dirname "${DUMP_FILE}")"
UPLOADS_ARCHIVE=$(find "${PARENT_DIR}" -maxdepth 1 -name "uploads-*.tar.gz" | head -n 1)

if [ -n "${UPLOADS_ARCHIVE}" ] && [ -f "${UPLOADS_ARCHIVE}" ]; then
  echo ""
  read -rp "Обнаружен архив клиентских файлов (${UPLOADS_ARCHIVE}). Восстановить uploads? [y/N]: " RESTORE_UPLOADS
  if [ "$RESTORE_UPLOADS" = "y" ] || [ "$RESTORE_UPLOADS" = "Y" ]; then
    echo "[RESTORE] Восстановление uploads..."
    docker compose exec -T app tar -xzf - -C /app/storage < "${UPLOADS_ARCHIVE}"
    echo "[RESTORE] Файлы uploads успешно восстановлены."
  fi
fi

echo ""
echo "=================================================="
echo " База данных успешно восстановлена!"
echo " Проверьте работу сайта: ${SITE_URL:-http://localhost}"
echo "=================================================="
