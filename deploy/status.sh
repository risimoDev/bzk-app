#!/usr/bin/env bash
# ==============================================================================
# BZK PRINT - Скрипт проверки статуса и здоровья сервера
# ==============================================================================
# Использование:
#   bash deploy/status.sh
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

echo "=================================================="
echo "          СТАТУС СЕРВЕРА BZK PRINT"
echo "=================================================="
echo "Дата/время: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "Директория: ${ROOT_DIR}"
if [ -d .git ]; then
  echo "Git коммит: $(git rev-parse --short HEAD 2>/dev/null) ($(git log -1 --pretty=%B 2>/dev/null | head -n 1))"
fi
echo ""

echo "--- 1. Контейнеры Docker ---"
docker compose ps
echo ""

echo "--- 2. Проверка здоровья (/api/health) ---"
if docker compose ps --status running | grep -q 'app'; then
  HEALTH_JSON=$(docker compose exec -T app wget -q -O - http://127.0.0.1:3000/api/health 2>/dev/null || echo "error")
  if [ "$HEALTH_JSON" != "error" ]; then
    echo "Ответ /api/health: ${HEALTH_JSON}"
  else
    echo "Предупреждение: не удалось получить ответ от /api/health"
  fi
else
  echo "Контейнер app не запущен!"
fi
echo ""

echo "--- 3. Ресурсы хоста ---"
echo "ОЗУ (RAM):"
free -h | awk 'NR<=2'
echo ""
echo "Дисковое пространство:"
df -h / | awk 'NR<=2'
echo ""

echo "--- 4. База данных ---"
if docker compose ps --status running | grep -q 'db'; then
  DB_SIZE=$(docker compose exec -T db psql -U "${POSTGRES_USER:-bzk}" -d "${POSTGRES_DB:-bzk}" -t -c "SELECT pg_size_pretty(pg_database_size('${POSTGRES_DB:-bzk}'));" 2>/dev/null | tr -d ' ' || echo "н/д")
  echo "Размер базы '${POSTGRES_DB:-bzk}': ${DB_SIZE}"
fi
echo ""

echo "--- 5. Последние резервные копии ---"
if [ -d "${ROOT_DIR}/backups" ]; then
  find "${ROOT_DIR}/backups" -type f -name "*.sql.gz" -printf "%TY-%Tm-%Td %TH:%TM: %p (%s bytes)\n" 2>/dev/null | sort -r | head -n 5 || echo "Бэкапов пока нет."
else
  echo "Папка backups/ ещё не создана."
fi
echo "=================================================="
