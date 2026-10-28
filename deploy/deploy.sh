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
  PRE_NAME="pre-deploy-$(date '+%Y-%m-%d-%H%M%S').dump"
  # Тот же формат и те же проверки, что у ночного scripts/backup.sh:
  # pg_dump -Fc пишет файл сам, без конвейера `| gzip`, у которого статус -
  # это статус gzip, и упавший дамп сохранялся бы как целый. Затем
  # оглавление (pg_restore --list) и полное чтение в /dev/null - оно
  # замечает обрезанный конец. Имя файл получает, только пройдя всё.
  # Работаем внутри контейнера базы: ./backups примонтирована туда как
  # /backups, а формат custom через `exec -T` надёжнее не гонять
  if docker compose exec -T db sh -c '
      pg_dump -U "$1" -d "$2" -Fc -f "$3.part" &&
      pg_restore --list "$3.part" >/dev/null &&
      pg_restore -f /dev/null "$3.part" &&
      mv "$3.part" "$3"' \
      sh "${POSTGRES_USER:-bzk}" "${POSTGRES_DB:-bzk}" "/backups/${PRE_NAME}" </dev/null; then
    success "Страховочный дамп сохранён: backups/${PRE_NAME} ($(du -h "backups/${PRE_NAME}" | cut -f1))"
  else
    # Недоделанный дамп по имени не отличить от целого - убираем
    docker compose exec -T db rm -f "/backups/${PRE_NAME}.part" </dev/null >/dev/null 2>&1 ||
      rm -f "backups/${PRE_NAME}.part" || true
    warn "Не удалось снять предварительный дамп базы данных. Продолжаем с осторожностью."
  fi

  # Страховочные копии нужны на случай отката последней выкладки, а
  # ночные дампы и так хранятся две недели. Оставляем 10 свежих (и старые
  # .sql.gz считаем вместе с ними), иначе частые деплои забьют диск
  find backups -maxdepth 1 -type f \( -name 'pre-deploy-*.dump' -o -name 'pre-deploy-*.sql.gz' \) \
    -printf '%T@ %p\n' | sort -rn | tail -n +11 | cut -d' ' -f2- |
    while IFS= read -r OLD; do
      # Сбой удаления (права) не повод срывать выкладку
      if rm -f -- "${OLD}"; then
        log "Удалён старый страховочный дамп: ${OLD}"
      else
        warn "Не удалось удалить ${OLD}"
      fi
    done
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
# proxy ждёт здоровья app (depends_on: service_healthy), и если app не
# поднялся, `up` завершится ошибкой. Не обрываем скрипт здесь: ниже
# проверка здоровья покажет статус и логи приложения - по ним и разбираться
if ! docker compose up -d --remove-orphans; then
  warn "docker compose up завершился с ошибкой - смотрим состояние приложения."
fi

# 8. Проверка здоровья (Healthcheck)
# Опираемся на healthcheck контейнера из docker-compose.yml: Docker сам
# опрашивает /api/health изнутри контейнера. С хоста порт 3000 не
# достучаться - он не опубликован, наружу смотрит только Caddy
log "Ожидание здоровья приложения (healthcheck контейнера, /api/health)..."
APP_ID="$(docker compose ps -q app)"
[ -n "${APP_ID}" ] || error "Контейнер app не создан. Смотрите вывод docker compose выше."

HEALTH=""
# start_period 40 с + до трёх неудачных проверок по 10 с - двух минут хватает
for _ in $(seq 1 60); do
  HEALTH="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${APP_ID}" 2>/dev/null || echo "missing")"
  case "${HEALTH}" in
    healthy | unhealthy | none | missing) break ;;
  esac
  sleep 2
  echo -n "."
done
echo ""

if [ "${HEALTH}" = "healthy" ]; then
  success "Приложение здорово: /api/health отвечает 200."
else
  warn "Приложение не стало здоровым (статус: ${HEALTH:-неизвестен})."
  warn "Последние проверки healthcheck:"
  docker inspect --format '{{if .State.Health}}{{range .State.Health.Log}}{{.End}} код {{.ExitCode}}: {{.Output}}{{println}}{{end}}{{end}}' "${APP_ID}" 2>/dev/null || true
  warn "Последние строки лога приложения:"
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
