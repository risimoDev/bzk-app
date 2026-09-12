#!/usr/bin/env bash
# ==============================================================================
# BZK PRINT - Первоначальная установка проекта на подготовленном сервере
# ==============================================================================
# Запускать ПОСЛЕ deploy/setup-server.sh, из корня проекта (/opt/bzk-app):
#   bash deploy/first-install.sh
#
# Что делает:
#   1. Проверяет .env - заполнен ли и не остались ли заглушки.
#   2. Собирает образ, применяет схему БД, поднимает сервисы (deploy.sh).
#   3. Наполняет базу: права ролей и реквизиты компании.
#   4. Заводит первого администратора (спросит почту и пароль).
#   5. Печатает оставшиеся ручные шаги.
#
# Скрипт идемпотентен: повторный запуск ничего не ломает.
# ==============================================================================

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[ИНФО]${NC} $*"; }
success() { echo -e "${GREEN}[УСПЕХ]${NC} $*"; }
warn()    { echo -e "${YELLOW}[ВНИМАНИЕ]${NC} $*"; }
error()   { echo -e "${RED}[ОШИБКА]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

COMPOSE="docker compose -f docker-compose.yml -f deploy/compose.tools.yml"

# ------------------------------------------------------------ 1. Проверка .env
info "1/5: Проверка файла окружения .env..."
[ -f .env ] || error "Нет файла .env. Скопируйте: cp .env.production.example .env && nano .env"

# shellcheck disable=SC1091
set -a; source .env; set +a

MISSING=""
for var in POSTGRES_PASSWORD DATABASE_URL SITE_DOMAIN SITE_URL AUTH_URL AUTH_SECRET; do
  if [ -z "${!var:-}" ]; then MISSING="${MISSING} ${var}"; fi
done
[ -n "${MISSING}" ] && error "Не заданы переменные в .env:${MISSING}"

# Оставленные заглушки - частая причина «работает, но не входит»
if grep -qE 'CHANGE_ME|GENERATE_WITH|YOUR_' .env; then
  error "В .env остались заглушки (CHANGE_ME / GENERATE_WITH / YOUR_). Замените их на реальные значения."
fi
# Права на .env: в нём пароли и секреты
chmod 600 .env || true
success ".env заполнен."

# ------------------------------------------------- 2. Сборка, схема, запуск
info "2/5: Сборка образа, применение схемы и запуск сервисов..."
bash deploy/deploy.sh

# ------------------------------------------------------- 3. Базовые данные
info "3/5: Наполнение базы (права ролей и реквизиты компании)..."
${COMPOSE} run --rm tools node scripts/seed-permissions.mjs
${COMPOSE} run --rm tools node scripts/seed-company.mjs
success "Права ролей и реквизиты компании заданы."

# ---------------------------------------------------- 4. Первый администратор
info "4/5: Создание администратора."
echo "Введите данные для входа в админку (пароль: минимум 8 символов, строчная и заглавная буквы и цифра)."
read -rp "  Почта администратора: " ADMIN_EMAIL
read -rsp "  Пароль: " ADMIN_PASSWORD; echo
read -rp "  Имя (можно пропустить): " ADMIN_NAME

if [ -z "${ADMIN_EMAIL}" ] || [ -z "${ADMIN_PASSWORD}" ]; then
  warn "Почта или пароль пустые - администратор не создан. Заведите позже:"
  warn "  ${COMPOSE} run --rm tools node scripts/create-admin.mjs <email> <пароль>"
else
  ${COMPOSE} run --rm tools \
    node --experimental-strip-types --import ./scripts/alias-loader.mjs \
    scripts/create-admin.mjs "${ADMIN_EMAIL}" "${ADMIN_PASSWORD}" "${ADMIN_NAME}"
fi

# --------------------------------------------------------- 5. Ручные шаги
echo -e "${GREEN}"
cat << EOF
==================================================
        ПЕРВОНАЧАЛЬНАЯ УСТАНОВКА ЗАВЕРШЕНА
==================================================
${NC}
Сайт:  ${SITE_URL}
Вход:  ${SITE_URL}/login  (учётная запись администратора создана выше)

ОСТАЛОСЬ СДЕЛАТЬ ВРУЧНУЮ:

  • Телеграм-бот. Войдите в админку → «Телеграм» и нажмите
    «Зарегистрировать вебхук». Токен и секрет должны быть в .env.

  • Перенос данных со старого сайта (только если нужно). Укажите в .env
    LEGACY_MYSQL_URL и выполните один раз:
      ${COMPOSE} run --rm tools node scripts/migrate-data.mjs

  • Проверьте бэкапы: первый дамп и архив файлов появятся в ./backups
    сразу после старта сервиса backup, дальше - каждую ночь.

Полезное:
  bash deploy/status.sh     # статус, ресурсы, свежие бэкапы
  bash deploy/logs.sh       # логи приложения
  bash deploy/backup-now.sh # ручной бэкап (база + файлы)
==================================================
EOF
