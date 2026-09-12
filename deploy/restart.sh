#!/usr/bin/env bash
# ==============================================================================
# BZK PRINT - Скрипт быстрого перезапуска сервисов
# ==============================================================================
# Использование:
#   bash deploy/restart.sh [app|proxy|db|all]
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

SERVICE="${1:-app}"

if [ "${SERVICE}" = "all" ]; then
  echo "[RESTART] Перезапуск всех сервисов..."
  docker compose restart
else
  echo "[RESTART] Перезапуск сервиса ${SERVICE}..."
  docker compose restart "${SERVICE}"
fi

echo "[RESTART] Статус сервисов:"
docker compose ps
