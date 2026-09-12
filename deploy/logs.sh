#!/usr/bin/env bash
# ==============================================================================
# BZK PRINT - Скрипт просмотра логов контейнеров
# ==============================================================================
# Использование:
#   bash deploy/logs.sh [app|db|proxy|backup] [количество_строк]
# Примеры:
#   bash deploy/logs.sh          # логи app (последние 100 строк + live stream)
#   bash deploy/logs.sh proxy    # логи прокси Caddy
#   bash deploy/logs.sh all 50   # все логи разом
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

SERVICE="${1:-app}"
LINES="${2:-100}"

if [ "${SERVICE}" = "all" ]; then
  exec docker compose logs -f --tail="${LINES}"
else
  exec docker compose logs -f --tail="${LINES}" "${SERVICE}"
fi
