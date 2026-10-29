#!/usr/bin/env bash
# ==============================================================================
# BZK PRINT - Скрипт создания немедленного полного бэкапа (База + Файлы заказов)
# ==============================================================================
# Использование:
#   bash deploy/backup-now.sh
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# Загрузка переменных окружения
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

STAMP=$(date '+%Y-%m-%d-%H%M%S')
BACKUP_DIR="${ROOT_DIR}/backups/manual-${STAMP}"
mkdir -p "${BACKUP_DIR}"

echo "[BACKUP] Запуск создания резервной копии (${STAMP})..."

# 1. Дамп базы данных PostgreSQL
# Формат и проверки - как у ночного scripts/backup.sh: pg_dump -Fc сам
# пишет файл (у прежнего конвейера `pg_dump | gzip` статус был статусом
# gzip, и упавший дамп сохранялся как успешный), затем оглавление
# (pg_restore --list) и полное чтение в /dev/null, которое замечает
# обрезанный конец. Имя .dump файл получает, только пройдя проверки, -
# deploy/restore.sh его принимает. Всё делается внутри контейнера базы:
# ./backups примонтирована туда как /backups
DB_NAME_IN_DIR="postgres-${POSTGRES_DB:-bzk}-${STAMP}.dump"
DB_FILE="${BACKUP_DIR}/${DB_NAME_IN_DIR}"
DB_FILE_IN_CONTAINER="/backups/manual-${STAMP}/${DB_NAME_IN_DIR}"
echo "[BACKUP] 1/2: Создание дампа базы данных..."
if docker compose exec -T db sh -c '
    pg_dump -U "$1" -d "$2" -Fc -f "$3.part" &&
    pg_restore --list "$3.part" >/dev/null &&
    pg_restore -f /dev/null "$3.part" &&
    mv "$3.part" "$3"' \
    sh "${POSTGRES_USER:-bzk}" "${POSTGRES_DB:-bzk}" "${DB_FILE_IN_CONTAINER}" </dev/null; then
  DB_SIZE=$(du -h "${DB_FILE}" | cut -f1)
  echo "[BACKUP] База данных сохранена: ${DB_FILE} (${DB_SIZE})"
else
  docker compose exec -T db rm -f "${DB_FILE_IN_CONTAINER}.part" </dev/null >/dev/null 2>&1 ||
    rm -f "${DB_FILE}.part" || true
  echo "[BACKUP] ОШИБКА при снятии дампа базы данных!"
  exit 1
fi

# 2. Архивация клиентских файлов и макетов (storage/uploads)
UPLOADS_FILE="${BACKUP_DIR}/uploads-${STAMP}.tar.gz"
echo "[BACKUP] 2/2: Архивация пользовательских файлов и макетов..."
# Копируем из тома/директории
if docker compose exec -T app tar -czf - -C /app/storage uploads > "${UPLOADS_FILE}" 2>/dev/null; then
  UPLOADS_SIZE=$(du -h "${UPLOADS_FILE}" | cut -f1)
  echo "[BACKUP] Загрузки сохранены: ${UPLOADS_FILE} (${UPLOADS_SIZE})"
elif [ -d "${ROOT_DIR}/storage/uploads" ]; then
  tar -czf "${UPLOADS_FILE}" -C "${ROOT_DIR}/storage" uploads
  UPLOADS_SIZE=$(du -h "${UPLOADS_FILE}" | cut -f1)
  echo "[BACKUP] Загрузки сохранены из локальной папки: ${UPLOADS_FILE} (${UPLOADS_SIZE})"
else
  echo "[BACKUP] Предупреждение: директория uploads пуста или недоступна."
fi

# 3. Сохранение метаданных бэкапа
cat > "${BACKUP_DIR}/metadata.txt" << EOF
Резервная копия BZK PRINT
Дата создания: $(date '+%Y-%m-%d %H:%M:%S %Z')
База данных:   $(basename "${DB_FILE}") (${DB_SIZE})
Файлы заказов: $(basename "${UPLOADS_FILE}") (${UPLOADS_SIZE:-0})
Git коммит:    $(git rev-parse HEAD 2>/dev/null || echo "нет git")
EOF

TOTAL_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)

echo "=================================================="
echo " Резервная копия успешно создана!"
echo " Путь: ${BACKUP_DIR}"
echo " Общий объём: ${TOTAL_SIZE}"
echo "=================================================="
