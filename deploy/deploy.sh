#!/usr/bin/env bash
# ==============================================================================
# BZK PRINT - Скрипт автоматического деплоя на production (Ubuntu VPS)
# ==============================================================================
# Использование:
#   bash deploy/deploy.sh [ветка, по умолчанию: текущая или main]
# ==============================================================================

set -euo pipefail

# Цвета для терминала
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${BLUE}[ДЕПЛОЙ $(date '+%H:%M:%S')]${NC} $*"; }
success() { echo -e "${GREEN}[УСПЕХ $(date '+%H:%M:%S')]${NC} $*"; }
warn() { echo -e "${YELLOW}[ВНИМАНИЕ]${NC} $*"; }
error() { echo -e "${RED}[ОШИБКА]${NC} $*"; exit 1; }

START_TIME=$(date +%s)

# Переход в корень проекта (где лежит docker-compose.yml)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

log "Начало развёртывания в ${ROOT_DIR}..."

# 1. Проверка окружения
if [ ! -f .env ]; then
  error "Файл .env не найден в ${ROOT_DIR}! Скопируйте .env.production.example в .env и заполните параметры."
fi

# Проверка базовых обязательных переменных в .env
set -a
# shellcheck disable=SC1091
source .env
set +a

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  error "Переменная POSTGRES_PASSWORD не задана в .env!"
fi
if [ -z "${AUTH_SECRET:-}" ]; then
  error "Переменная AUTH_SECRET не задана в .env! Сгенерируйте: openssl rand -base64 32"
fi
if [ -z "${SITE_URL:-}" ]; then
  warn "Переменная SITE_URL не задана в .env! Канонические ссылки могут работать некорректно."
fi

# 2. Обновление кода из Git (если проект под git)
TARGET_BRANCH="${1:-}"
if [ -d .git ]; then
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  BRANCH="${TARGET_BRANCH:-$CURRENT_BRANCH}"
  log "Получение свежих изменений из Git (ветка: ${BRANCH})..."
  git fetch origin "${BRANCH}"
  git checkout "${BRANCH}"
  git pull origin "${BRANCH}"
  COMMIT_HASH=$(git rev-parse --short HEAD)
  COMMIT_MSG=$(git log -1 --pretty=%B | head -n 1)
  log "Текущий коммит: ${COMMIT_HASH} - \"${COMMIT_MSG}\""
else
  COMMIT_HASH="no-git"
  log "Git репозиторий не обнаружен. Используются локальные файлы."
fi

# 3. Страховочный бэкап базы перед обновлением
mkdir -p backups
if docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -q '^db$'; then
  log "Создание предварительного бэкапа базы данных перед деплоем..."
  PRE_BACKUP="backups/pre-deploy-$(date '+%Y-%m-%d-%H%M%S').sql.gz"
  if docker compose exec -T db pg_dump -U "${POSTGRES_USER:-bzk}" -d "${POSTGRES_DB:-bzk}" | gzip > "${PRE_BACKUP}.part"; then
    mv "${PRE_BACKUP}.part" "${PRE_BACKUP}"
    success "Страховочный дамп сохранён: ${PRE_BACKUP} ($(du -h "${PRE_BACKUP}" | cut -f1))"
  else
    rm -f "${PRE_BACKUP}.part"
    warn "Не удалось снять предварительный дамп базы данных. Продолжаем с осторожностью."
  fi
else
  log "Контейнер базы db ещё не запущен - пропускаем предварительный дамп."
fi

# 4. Запуск и ожидание готовности базы данных
log "Запуск сервиса базы данных PostgreSQL..."
docker compose up -d db
log "Ожидание готовности PostgreSQL (healthcheck)..."
ATTEMPTS=0
MAX_ATTEMPTS=30
while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  if docker compose exec -T db pg_isready -U "${POSTGRES_USER:-bzk}" -d "${POSTGRES_DB:-bzk}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
  ATTEMPTS=$((ATTEMPTS + 1))
done

if [ $ATTEMPTS -eq $MAX_ATTEMPTS ]; then
  error "База данных PostgreSQL не ответила за ${MAX_ATTEMPTS} секунд!"
fi
success "База данных готова к работе."

# 5. Сборка нового образа приложения
log "Сборка Docker-образа приложения (Next.js 16 standalone)..."
docker compose build --pull app

# 6. Применение миграций схемы Drizzle ORM
log "Применение схемы базы данных через drizzle-kit..."
# Боевой образ (стадия runner) - standalone: в нём нет ни drizzle-kit,
# ни схемы, ни конфига. Миграцию гоняем из служебного контейнера tools
# (стадия builder), где есть весь код и devDependencies.
docker compose -f docker-compose.yml -f deploy/compose.tools.yml \
  run --rm tools npx drizzle-kit push || {
  error "Ошибка применения схемы Drizzle! Проверьте логи выше."
}
success "Схема базы данных успешно синхронизирована."

# 7. Запуск всех сервисов (app, proxy, backup, db)
log "Перезапуск сервисов в фоновом режиме..."
docker compose up -d --remove-orphans

# 8. Проверка здоровья (Healthcheck)
log "Проверка работоспособности сервиса (/api/health)..."
HEALTH_OK=false
for i in $(seq 1 30); do
  # Проверяем напрямую контейнер приложения на порту 3000
  HTTP_CODE=$(docker compose exec -T app wget -q -O - --server-response http://127.0.0.1:3000/api/health 2>&1 | awk '/^  HTTP/{print $2}' | tail -n 1 || echo "000")
  
  if [ "$HTTP_CODE" = "200" ]; then
    HEALTH_OK=true
    break
  fi
  
  # Запасная проверка через curl с хоста, если wget внутри не отработал
  if curl -s -f http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    HEALTH_OK=true
    break
  fi
  
  sleep 2
  echo -n "."
done
echo ""

if [ "$HEALTH_OK" = true ]; then
  success "Приложение успешно отвечает 200 OK на /api/health!"
else
  warn "Приложение не ответило 200 OK за 60 секунд. Вывод последних логов контейнера:"
  docker compose logs --tail=40 app
  error "Деплой завершился с ошибкой проверки здоровья!"
fi

# 9. Очистка устаревших Docker-образов
log "Очистка старых неиспользуемых слоёв Docker..."
docker image prune -f >/dev/null 2>&1 || true

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo -e "${GREEN}"
cat << EOF
==================================================
        ДЕПЛОЙ УСПЕШНО ЗАВЕРШЁН! (${DURATION} сек)
==================================================
${NC}
Коммит:       ${COMMIT_HASH}
Сайт:         ${SITE_URL:-http://localhost}
Контейнеры:
$(docker compose ps)

Полезные команды:
  bash deploy/logs.sh         # Просмотр логов
  bash deploy/status.sh       # Статус и ресурсы
  bash deploy/backup-now.sh   # Ручной бэкап
==================================================
EOF
