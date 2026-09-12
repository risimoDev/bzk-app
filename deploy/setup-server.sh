#!/usr/bin/env bash
# ==============================================================================
# BZK PRINT - Скрипт первоначальной настройки сервера на Ubuntu 22.04 / 24.04 LTS
# ==============================================================================
# Использование:
#   sudo bash deploy/setup-server.sh
# или одной строкой на чистом сервере:
#   curl -fsSL https://raw.githubusercontent.com/.../deploy/setup-server.sh | sudo bash
# ==============================================================================

set -euo pipefail

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() { echo -e "${BLUE}[ИНФО]${NC} $*"; }
success() { echo -e "${GREEN}[УСПЕХ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ВНИМАНИЕ]${NC} $*"; }
error() { echo -e "${RED}[ОШИБКА]${NC} $*"; exit 1; }

# Проверка прав root
if [ "$EUID" -ne 0 ]; then
  error "Скрипт должен быть запущен с правами суперпользователя: sudo bash $0"
fi

echo -e "${GREEN}"
cat << 'EOF'
 ____  _____ _  __   ____  ____  ___ _   _ _____ 
| __ )|__  /| |/ /  |  _ \|  _ \|_ _| \ | |_   _|
|  _ \  / / | ' /   | |_) | |_) || ||  \| | | |  
| |_) |/ /_ | . \   |  __/|  _ < | || |\  | | |  
|____//____||_|\_\  |_|   |_| \_\___|_| \_| |_|  
==================================================
   Настройка production-сервера Ubuntu LTS
==================================================
EOF
echo -e "${NC}"

# 1. Обновление репозиториев и системы
info "1/9: Обновление системных пакетов Ubuntu..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

# 2. Установка базовых утилит
info "2/9: Установка необходимых системных утилит..."
apt-get install -y -qq \
  curl \
  wget \
  git \
  ufw \
  fail2ban \
  htop \
  jq \
  unzip \
  tar \
  gzip \
  ca-certificates \
  gnupg \
  lsb-release \
  software-properties-common

# 3. Настройка часового пояса (Asia/Yekaterinburg - время компании, Пермь)
info "3/9: Настройка часового пояса (Asia/Yekaterinburg)..."
timedatectl set-timezone Asia/Yekaterinburg || true
info "Текущее системное время: $(date)"

# 4. Настройка файла подкачки (Swap)
info "4/9: Проверка и настройка Swap..."
TOTAL_MEM_MB=$(free -m | awk '/^Mem:/{print $2}')
EXISTING_SWAP=$(free -m | awk '/^Swap:/{print $2}')

if [ "$EXISTING_SWAP" -lt 1024 ]; then
  SWAP_SIZE="2G"
  if [ "$TOTAL_MEM_MB" -le 2048 ]; then
    SWAP_SIZE="4G"
  fi
  info "Swap отсутствует или меньше 1GB. Создание ${SWAP_SIZE} файла подкачки..."
  if [ ! -f /swapfile ]; then
    fallocate -l "$SWAP_SIZE" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
      echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    # Оптимальный swappiness для сервера
    sysctl vm.swappiness=10
    echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
    success "Файл подкачки ${SWAP_SIZE} успешно активирован."
  fi
else
  info "Swap уже настроен (${EXISTING_SWAP} MB)."
fi

# 5. Установка официального Docker & Docker Compose Plugin
info "5/9: Проверка и установка Docker Engine..."
if ! command -v docker &> /dev/null; then
  info "Добавление официального репозитория Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  success "Docker установлен: $(docker --version)"
else
  info "Docker уже установлен: $(docker --version)"
fi

# Настройка ротации логов для Docker (чтобы логи не забивали диск)
info "Настройка ротации логов Docker (/etc/docker/daemon.json)..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << 'DAEMON_EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "3"
  }
}
DAEMON_EOF
systemctl restart docker
systemctl enable docker

# 6. Установка Node.js 22 LTS на хост (для локальных утилит и миграций)
info "6/9: Проверка и установка Node.js 22 LTS на хост..."
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'.' -f1)" != "v22" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - > /dev/null
  apt-get install -y -qq nodejs
  success "Node.js установлен: $(node -v), npm: $(npm -v)"
else
  info "Node.js уже установлен: $(node -v)"
fi

# 7. Настройка файрвола UFW
info "7/9: Настройка файрвола UFW..."
# Определяем текущий SSH-порт, чтобы случайно не заблокировать себя
SSH_PORT=$(grep -E "^Port " /etc/ssh/sshd_config 2>/dev/null | awk '{print $2}' || echo "22")
SSH_PORT=${SSH_PORT:-22}

ufw default deny incoming
ufw default allow outgoing
ufw allow "${SSH_PORT}/tcp" comment "SSH Port"
ufw allow 80/tcp comment "HTTP (Caddy/Nginx)"
ufw allow 443/tcp comment "HTTPS (Caddy/Nginx)"
ufw --force enable
success "UFW включен. Открыты порты: ${SSH_PORT} (SSH), 80 (HTTP), 443 (HTTPS)."

# 8. Настройка Fail2ban (защита от брутфорса SSH)
info "8/9: Настройка Fail2ban..."
cat > /etc/fail2ban/jail.local << F2B_EOF
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port = ${SSH_PORT}
logpath = %(sshd_log)s
backend = systemd
F2B_EOF

systemctl restart fail2ban
systemctl enable fail2ban
success "Fail2ban запущен и защищает SSH (порт ${SSH_PORT})."

# 9. Создание рабочей директории проекта
info "9/9: Создание структуры директорий проекта в /opt/bzk-app..."
APP_DIR="/opt/bzk-app"
mkdir -p "${APP_DIR}/storage/uploads"
mkdir -p "${APP_DIR}/backups"

# Добавляем удобные alias для администратора
if ! grep -q 'bzk-aliases' /root/.bashrc; then
  cat >> /root/.bashrc << 'BASHRC_EOF'

# --- bzk-aliases ---
alias dps='docker compose ps'
alias dlogs='docker compose logs -f --tail=100'
alias ddown='docker compose down'
alias dup='docker compose up -d'
alias bzk-status='bash /opt/bzk-app/deploy/status.sh'
alias bzk-deploy='bash /opt/bzk-app/deploy/deploy.sh'
alias bzk-backup='bash /opt/bzk-app/deploy/backup-now.sh'
# --------------------
BASHRC_EOF
fi

echo -e "${GREEN}"
cat << EOF
==================================================
  СЕРВЕР УСПЕШНО НАСТРОЕН И ГОТОВ К РАЗВЁРТЫВАНИЮ!
==================================================
${NC}
Директория приложения: ${APP_DIR}
Часовой пояс:          Asia/Yekaterinburg
Docker & Compose:      Установлены
UFW Файрвол:           Активен (порты: ${SSH_PORT}, 80, 443)
Fail2ban:              Активен
Swap:                  Настроен

СЛЕДУЮЩИЕ ШАГИ:
1. Скопируйте код проекта в ${APP_DIR}:
     git clone <URL_РЕПОЗИТОРИЯ> ${APP_DIR}
   или скопируйте через rsync с локальной машины:
     rsync -avz --exclude 'node_modules' --exclude '.next' ./ root@ВАШ_IP:${APP_DIR}/

2. Перейдите в папку проекта:
     cd ${APP_DIR}

3. Скопируйте и настройте файл переменных окружения:
     cp .env.production.example .env
     nano .env   # Укажите реальные пароли, домен и токены

4. Запустите первоначальный деплой:
     bash deploy/deploy.sh

EOF
