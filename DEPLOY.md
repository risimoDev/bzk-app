# Инструкция по развёртыванию BZK PRINT на сервере Ubuntu LTS

Полное руководство по установке, настройке и запуску нового сайта «БЗК Принт» на чистом VPS-сервере с ОС **Ubuntu 22.04 или 24.04 LTS**.

---

## 1. Требования к серверу

| Параметр | Минимальные | Рекомендуемые |
| :--- | :--- | :--- |
| **ОС** | Ubuntu 22.04 / 24.04 LTS | Ubuntu 24.04 LTS (x86_64) |
| **CPU** | 1-2 vCPU | 2-4 vCPU |
| **RAM** | 2 GB (+ swap) | 4 GB |
| **Диск** | 20 GB NVMe / SSD | 40+ GB NVMe |
| **Сеть** | Публичный IPv4 | Публичный IPv4 + PTR-запись |

> [!NOTE]
> Скрипт `setup-server.sh` автоматически создаёт 2-4 GB файл подкачки (Swap), что гарантирует стабильную компиляцию Next.js без падений по Out-of-Memory даже на 2 GB VPS.

---

## 2. Подготовка DNS домена

Перед запуском убедитесь, что в панели вашего регистратора домена (Reg.ru, Beget, Timeweb, Cloudflare) настроены DNS-записи:

- **A-запись**: `bzkprint.ru` → `IP_ВАШЕГО_СЕРВЕРА`
- **A-запись**: `www.bzkprint.ru` → `IP_ВАШЕГО_СЕРВЕРА`
- **TTL**: рекомендуем поставить `300` (5 минут) на время переключения.

*Caddy автоматически выпустит бесплатный SSL-сертификат Let's Encrypt, как только домен будет указывать на IP сервера.*

---

## 3. Шаг 1: Первоначальная настройка сервера

Подключитесь к вашему новому серверу по SSH:
```bash
ssh root@ВАШ_IP_СЕРВЕРА
```

Запустите скрипт первоначальной настройки сервера:
```bash
# 1. Скачайте и запустите скрипт настройки (или скопируйте файл на сервер)
bash <(curl -fsSL https://raw.githubusercontent.com/risimoDev/bzk/main/deploy/setup-server.sh 2>/dev/null || cat deploy/setup-server.sh)
```
*Либо, если репозиторий уже скопирован:*
```bash
cd /opt/bzk-app
sudo bash deploy/setup-server.sh
```

**Что делает `setup-server.sh` автоматически:**
1. Обновляет пакеты Ubuntu (`apt update && apt upgrade -y`).
2. Настраивает часовой пояс `Asia/Yekaterinburg` (время компании, Пермь).
3. Создаёт и оптимизирует файл подкачки Swap (2-4 GB).
4. Устанавливает официальный Docker Engine и Docker Compose.
5. Настраивает ротацию логов Docker (защита от переполнения диска).
6. Устанавливает Node.js 22 LTS на хост.
7. Включает файрвол `UFW` (открыты только SSH, 80 и 443).
8. Включает `Fail2ban` для защиты от брутфорс-атак на SSH.
9. Создаёт рабочие директории `/opt/bzk-app/storage/uploads` и `/opt/bzk-app/backups`.

---

## 4. Шаг 2: Размещение файлов проекта

Скопируйте проект в рабочую папку `/opt/bzk-app`.

**Вариант А: через Git (рекомендуется):**
```bash
git clone https://github.com/risimoDev/bzk.git /opt/bzk-app
cd /opt/bzk-app
```

**Вариант Б: с локального компьютера через rsync:**
```bash
# Выполнять на вашем локальном компьютере из папки C:\Projects\bzk-app
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude 'backups' ./ root@ВАШ_IP:/opt/bzk-app/
```

---

## 5. Шаг 3: Настройка переменных окружения (`.env`)

В директории `/opt/bzk-app` создайте файл боевой конфигурации:
```bash
cd /opt/bzk-app
cp .env.production.example .env
chmod 600 .env
nano .env
```

**Обязательные параметры для заполнения:**
1. `POSTGRES_PASSWORD`: надёжный пароль (сгенерируйте: `openssl rand -base64 24`).
2. `DATABASE_URL`: подставьте пароль в строку подключения: `postgresql://bzk:ВАШ_ПАРОЛЬ@db:5432/bzk`.
3. `AUTH_SECRET`: секретный ключ сессий (сгенерируйте: `openssl rand -base64 32`).
4. `SITE_DOMAIN`: домен сайта, например `bzkprint.ru`.
5. `SITE_URL`: канонический адрес с https: `https://bzkprint.ru`.
6. `SMTP_*`: параметры Яндекс/VK Workmail почты для отправки счетов и паролей.
7. `TELEGRAM_BOT_TOKEN`: токен вашего бота от `@BotFather`.

---

## 6. Шаг 4: Первоначальная установка (одной командой)

На чистой базе всё за один заход делает `first-install.sh`:

```bash
bash deploy/first-install.sh
```

**Он выполнит:**
1. Проверит `.env` - заполнен ли и не остались ли заглушки (`CHANGE_ME`…), поставит права `600`.
2. Запустит `deploy.sh`: страховочный бэкап, сборку образа, применение схемы (`drizzle-kit push`), запуск сервисов, ожидание статуса `healthy` у контейнера приложения (Docker сам опрашивает `/api/health` изнутри контейнера; Caddy стартует только после этого).
3. Наполнит базу: права ролей и реквизиты компании.
4. Заведёт первого администратора (спросит почту и пароль).
5. Напечатает оставшиеся ручные шаги.

Скрипт идемпотентен - повторный запуск ничего не ломает.

> **Про служебный контейнер.** Боевой образ приложения - *standalone*: в
> нём нет ни `drizzle-kit`, ни исходников, ни `scripts/`. Поэтому миграции
> схемы и seed-скрипты гоняются через отдельный контейнер `tools` (стадия
> `builder`), подключаемый файлом `deploy/compose.tools.yml`. Все команды
> ниже это учитывают.

### Обновление уже работающего сайта

Для последующих выкладок хватает `deploy.sh` - он один пересобирает образ
и применяет схему:

```bash
git pull
bash deploy/deploy.sh
```

---

## 7. Отдельные операции с базой (если нужны вручную)

`first-install.sh` уже всё сделал. Эти команды - на случай, когда нужно
что-то повторить точечно. Обратите внимание на префикс с `compose.tools.yml`:

```bash
TOOLS="docker compose -f docker-compose.yml -f deploy/compose.tools.yml"

# Реквизиты компании (из них собираются счета и УПД)
$TOOLS run --rm tools node scripts/seed-company.mjs

# Матрица прав ролей сотрудников
$TOOLS run --rm tools node scripts/seed-permissions.mjs

# Ещё один администратор или смена пароля существующему
$TOOLS run --rm tools node --experimental-strip-types --import ./scripts/alias-loader.mjs \
  scripts/create-admin.mjs user@example.ru 'Пароль-2026'

# Применить изменения схемы вручную
$TOOLS run --rm tools npx drizzle-kit push
```

### (Опционально) Перенос данных со старого PHP-сайта

Если нужно перенести клиентов, заказы и товары из старой MySQL:
1. Впишите `LEGACY_MYSQL_URL="mysql://user:pass@old-host:3306/db"` в `.env`.
2. Запустите один раз:
```bash
docker compose -f docker-compose.yml -f deploy/compose.tools.yml \
  run --rm tools node scripts/migrate-data.mjs
```
Скрипт идемпотентен - его можно запускать повторно без дублирования данных.

---

## 8. Шаг 5: Подключение Telegram бота и вебхука

1. Откройте в браузере страницу админки: `https://bzkprint.ru/admin/telegram`.
2. Нажмите кнопку **«Зарегистрировать вебхук»**.
3. Бот начнёт принимать сообщения, привязывать аккаунты клиентов и присылать уведомления в рабочий чат.

> **Важно.** В `.env` должны быть заданы `TELEGRAM_BOT_TOKEN` и
> `TELEGRAM_WEBHOOK_SECRET`. Без секрета вебхук в проде намеренно отвечает
> `503` - это защита от чужих запросов боту.

---

## 9. Повседневная эксплуатация (Шпаргалка команд)

Для удобства администратора на сервере настроены короткие команды:

### Просмотр логов:
```bash
bash deploy/logs.sh            # логи приложения в реальном времени
bash deploy/logs.sh proxy      # логи веб-сервера Caddy
bash deploy/logs.sh db         # логи базы данных
bash deploy/logs.sh all        # логи всех сервисов
```

### Проверка состояния сервера:
```bash
bash deploy/status.sh
```
*Показывает статус контейнеров и healthcheck приложения, ответ /api/health, свободную память, размер базы и свежие бэкапы. `/api/health` открыт всему интернету и поэтому отвечает только `{"status":"ok"}` (200) или `{"status":"degraded"}` (503); причину сбоя ищите в `bash deploy/logs.sh`.*

### Журнал запросов Caddy
Лог доступа пишется в том `caddy_data` (`/data/access.log` в контейнере `proxy`), ротация - по 50 МБ, хранятся 10 файлов. Из адресов и заголовка `Referer` вырезается параметр `token` (ссылка сброса пароля), заголовки `Cookie`, `Authorization` и `Set-Cookie` не пишутся вовсе. Посмотреть:
```bash
docker compose exec proxy tail -n 50 /data/access.log
```

### Часовой пояс базы
Контейнер `db` живёт по `Asia/Yekaterinburg` (`TZ`, `PGTZ`, `log_timezone`): время в логах Postgres и вывод `docker compose exec db psql` - местные. Сам сервер базы при этом намеренно закреплён в UTC (`-c timezone=UTC` в `docker-compose.yml`): часть колонок - `timestamp` без пояса, их `DEFAULT now()` зависит от пояса сеанса, а приложение читает их как UTC. Поэтому, вставляя строки руками через psql, задавайте даты явно.

### Создание ручного бэкапа (База + Загрузки):
```bash
bash deploy/backup-now.sh
```
*Создаёт в `/opt/bzk-app/backups/manual-...` дамп PostgreSQL (`postgres-bzk-….dump`, формат custom, проверенный так же, как ночной) и архив всех загруженных макетов.*

### Восстановление из бэкапа:
```bash
bash deploy/restore.sh
```
*Интерактивное меню с выбором даты бэкапа и подтверждением. Можно сразу указать файл: `bash deploy/restore.sh backups/bzk-ГГГГ-ММ-ДД-ЧЧММ.dump`. Понимает и `.dump` (ночные, ручные, страховочные `pre-deploy-…` перед деплоем), и старые `.sql.gz`; восстановление идёт одной транзакцией - если дамп битый, база остаётся как была.*

### Быстрый перезапуск:
```bash
bash deploy/restart.sh         # перезапуск приложения
bash deploy/restart.sh all     # перезапуск всех сервисов
```

### Обновление на новую версию (Последующие деплои):
```bash
git pull                       # или делайте git pull внутри deploy.sh
bash deploy/deploy.sh
```

---

## 10. Резервное копирование (Автоматическое)

В `docker-compose.yml` встроен независимый фоновый сервис `backup`:
- Каждую ночь в **03:00** (по часовому поясу компании) создаётся дамп `backups/bzk-ГГГГ-ММ-ДД-ЧЧММ.dump` - формат custom (`pg_dump -Fc`), он уже сжат. Перед тем как дать файлу имя, скрипт проверяет его через `pg_restore --list` и полным чтением (`pg_restore -f /dev/null`); не собравшийся дамп удаляется, а не остаётся рядом с целыми. Так же снимаются ручные копии (`backup-now.sh`) и страховочные перед деплоем (`deploy.sh`, хранятся 10 последних). Копии до этого перехода называются `….sql.gz` и удаляются по тому же сроку.
- Рядом кладётся архив всех загруженных файлов - макетов клиентов, фотоотчётов брака, картинок каталога: `backups/uploads-ГГГГ-ММ-ДД-ЧЧММ.tar.gz`. Без него дамп неполон: в базе лежат только имена файлов.
- Дампы старше 14 дней (`BACKUP_RETAIN_DAYS`) и архивы файлов старше 7 дней (`BACKUP_UPLOADS_RETAIN_DAYS`) удаляются автоматически. Файлы весят на порядки больше базы, поэтому хранятся меньше.
- Всё сохраняется на хосте в `/opt/bzk-app/backups/`.

Восстановить базу - проще всего `bash deploy/restore.sh` (см. выше). Вручную, при остановленном приложении (`docker compose stop app`); папка `backups/` видна в контейнере базы как `/backups`:
```bash
# новые копии (.dump)
docker compose exec -T db pg_restore -U bzk -d bzk --clean --if-exists \
  --no-owner --single-transaction /backups/bzk-ГГГГ-ММ-ДД-ЧЧММ.dump

# старые копии (.sql.gz) - простой SQL, накатывать на пустую базу
gunzip -c backups/bzk-ГГГГ-ММ-ДД-ЧЧММ.sql.gz | docker compose exec -T db psql -U bzk -d bzk
```

Восстановить файлы из ночного архива:
```bash
docker compose exec -T app tar -xzf - -C /app/storage/uploads < backups/uploads-ГГГГ-ММ-ДД-ЧЧММ.tar.gz
```

### Копии вне сервера (rclone)

Копии на том же диске не спасут, если пропадёт сам сервер. Сервис `backup` умеет после каждого успешного дампа отправить его во внешнее хранилище через [rclone](https://rclone.org) (Яндекс.Диск, S3, SFTP и т.д.) - если задана переменная `RCLONE_REMOTE`. В образе `postgres:17-alpine` rclone нет; без него скрипт пишет в лог предупреждение и работает как раньше. Архивы файлов (`uploads-…`) не выгружаются - они большие; их при желании копируйте отдельно.

Как включить, не меняя `docker-compose.yml`:

1. На своём компьютере настройте хранилище: `rclone config` (например, удалённое хранилище с именем `yadisk`). Скопируйте получившийся `rclone.conf` на сервер в `/opt/bzk-app/rclone.conf` и закройте его: `chmod 600 rclone.conf`. В git этот файл не попадает (`/rclone.conf` в `.gitignore`) - в нём ключи доступа.
2. В `.env` добавьте `RCLONE_REMOTE=yadisk:bzk-backups` (имя хранилища из конфига и папка в нём).
3. Рядом с `docker-compose.yml` создайте `docker-compose.override.yml` - Compose подхватит его сам:
   ```yaml
   services:
     backup:
       environment:
         RCLONE_REMOTE: ${RCLONE_REMOTE:-}
         RCLONE_CONFIG: /config/rclone.conf
       volumes:
         # Не только для чтения: у хранилищ со входом через OAuth
         # (Яндекс.Диск, Google Drive) rclone дописывает в конфиг
         # обновлённый токен
         - ./rclone.conf:/config/rclone.conf
       # rclone ставится при каждом старте контейнера. Не поставился (нет
       # сети) - бэкап всё равно запускается, а в логе будет предупреждение
       entrypoint:
         - /bin/sh
         - -c
         - 'apk add --no-cache rclone >/dev/null 2>&1 || echo "[backup] rclone не установился"; exec /bin/sh /usr/local/bin/backup.sh'
   ```
   `docker compose up` (и `deploy/deploy.sh`) подхватывают этот файл без дополнительных флагов.
4. `docker compose up -d backup`, затем `bash deploy/logs.sh backup` (или `docker compose logs backup`): в логе должна появиться строка `выгружено: yadisk:bzk-backups/bzk-….dump`.

Срок хранения во внешнем хранилище скрипт не отслеживает - настройте его там (правило жизненного цикла в S3) или периодически чистите `rclone delete --min-age 60d yadisk:bzk-backups`.
