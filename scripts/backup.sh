#!/bin/sh
# Ночной бэкап: дамп базы и архив загруженных файлов.
#
# Крутится в отдельном контейнере рядом с базой и делает три вещи:
# складывает свежий дамп в /backups, туда же - архив тома с файлами и
# убирает копии старше срока хранения. Расписание - простой цикл со сном:
# планировщика в alpine-образе postgres нет, а тащить ради одной задачи
# cron значит собирать свой образ.
#
# Файлы архивируются отдельно от базы и хранятся меньше. Без них дамп
# неполон: в базе лежат только имена, а макеты клиентов, фотоотчёты брака
# и картинки каталога - в томе uploads. Но весят они на порядки больше
# дампа, и две недели полных архивов могут забить диск.
#
# Дамп - в формате custom (`pg_dump -Fc`, файл .dump): он уже сжат и
# пишется прямо в файл. Раньше был конвейер `pg_dump | gzip`, а у
# конвейера статус последней команды - gzip; упавший на середине дамп
# сохранялся как успешный. Старые копии .sql.gz остаются читаемыми и
# удаляются по тому же сроку.
#
# Восстановление базы - скрипт сам останавливает приложение, понимает
# оба формата и откатывается целиком, если что-то пошло не так:
#   bash deploy/restore.sh backups/bzk-2026-09-06-0300.dump
#
# Вручную (приложение остановить: docker compose stop app). Папка
# ./backups примонтирована в контейнер базы как /backups:
#   docker compose exec -T db pg_restore -U bzk -d bzk --clean --if-exists \
#     --no-owner --single-transaction /backups/bzk-2026-09-06-0300.dump
# Старая копия .sql.gz (простой SQL; накатывать на пустую базу):
#   gunzip -c backups/bzk-2026-09-06-0300.sql.gz | \
#     docker compose exec -T db psql -U bzk -d bzk
#
# Восстановление файлов:
#   docker compose exec -T app tar -xzf - -C /app/storage/uploads \
#     < backups/uploads-2026-09-06-0300.tar.gz
#
# Копия вне сервера (необязательно). Если задан RCLONE_REMOTE (например,
# `yadisk:bzk-backups`), свежий дамп после проверки уходит туда же
# командой `rclone copy`. В образе postgres:17-alpine rclone нет, поэтому
# без него скрипт только пишет предупреждение в лог и работает как раньше.
# Как поставить rclone и передать настройки, не меняя основной
# docker-compose.yml, - в DEPLOY.md, раздел про резервное копирование.
set -eu

: "${POSTGRES_USER:=bzk}"
: "${POSTGRES_DB:=bzk}"
: "${RETAIN_DAYS:=14}"
: "${UPLOADS_RETAIN_DAYS:=7}"
# Час ночного запуска по часовому поясу контейнера
: "${BACKUP_HOUR:=3}"
# Куда примонтирован том с файлами. Нет папки - архив пропускаем
: "${UPLOADS_DIR:=/uploads}"
# Куда выгружать копии вне сервера (rclone-путь). Пусто - не выгружаем
: "${RCLONE_REMOTE:=}"

log() { echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

# Выгрузка вне сервера. Ошибка здесь не отменяет локальную копию: она
# уже лежит на диске, а сбой сети - не повод считать бэкап несостоявшимся
offsite() {
  [ -n "$RCLONE_REMOTE" ] || return 0

  if ! command -v rclone >/dev/null 2>&1; then
    log "ВНИМАНИЕ: задан RCLONE_REMOTE, но rclone в контейнере нет - копия осталась только на сервере"
    return 0
  fi

  if rclone copy "$1" "$RCLONE_REMOTE"; then
    log "выгружено: $RCLONE_REMOTE/$(basename "$1")"
  else
    log "ОШИБКА: не удалось выгрузить $1 в $RCLONE_REMOTE"
  fi
}

dump() {
  stamp=$(date '+%Y-%m-%d-%H%M')
  file="/backups/${POSTGRES_DB}-${stamp}.dump"

  # Без конвейера: статус - это статус самого pg_dump, главная защита.
  # Дальше две проверки файла, обе только на чтение. `pg_restore --list`
  # читает лишь оглавление в начале файла: оно отсеет не тот формат и
  # испорченный заголовок, но обрезанный конец не заметит. Поэтому затем
  # полное чтение в /dev/null - оно проходит все блоки данных. Ни то ни
  # другое не доказывает, что дамп ляжет в базу: это проверяет только
  # настоящее восстановление (deploy/restore.sh на копии базы)
  if pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$file.part" &&
    pg_restore --list "$file.part" >/dev/null &&
    pg_restore -f /dev/null "$file.part"; then
    mv "$file.part" "$file"
    log "база: $file ($(du -h "$file" | cut -f1))"
  else
    # Недоделанный дамп хуже отсутствующего: по имени его не отличить
    # от целого, и восстановление из него оборвётся на середине
    rm -f "$file.part"
    log "ОШИБКА: дамп не собрался"
    return 1
  fi

  offsite "$file"

  # Старые копии .sql.gz (до перехода на формат custom) - по тому же сроку
  find /backups -maxdepth 1 \
    \( -name "${POSTGRES_DB}-*.dump" -o -name "${POSTGRES_DB}-*.sql.gz" \) \
    -mtime "+$RETAIN_DAYS" -print -delete |
    while read -r old; do log "удалён старый: $old"; done
}

archive_uploads() {
  if [ ! -d "$UPLOADS_DIR" ]; then
    log "папки $UPLOADS_DIR нет - архив файлов пропущен"
    return 0
  fi

  stamp=$(date '+%Y-%m-%d-%H%M')
  file="/backups/uploads-${stamp}.tar.gz"

  # -C: в архиве пути от корня тома, без /uploads впереди - так его
  # можно распаковать прямо в /app/storage/uploads приложения
  if tar -czf "$file.part" -C "$UPLOADS_DIR" .; then
    mv "$file.part" "$file"
    log "файлы: $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.part"
    log "ОШИБКА: архив файлов не собрался"
    return 1
  fi

  find /backups -maxdepth 1 -name "uploads-*.tar.gz" -mtime "+$UPLOADS_RETAIN_DAYS" -print -delete |
    while read -r old; do log "удалён старый: $old"; done
}

run() {
  # Ошибка одного не должна отменять другое: дамп без файлов всё равно
  # лучше, чем ничего
  dump || true
  archive_uploads || true
}

log "запущен: в ${BACKUP_HOUR}:00; база хранится ${RETAIN_DAYS} дн., файлы - ${UPLOADS_RETAIN_DAYS} дн."
if [ -n "$RCLONE_REMOTE" ]; then
  log "копии базы выгружаются в $RCLONE_REMOTE"
fi

# Первая копия сразу: иначе после переустановки сервера её не будет
# до самой ночи
run

while true; do
  # Спим до ближайшего BACKUP_HOUR. Считаем каждый раз заново, чтобы
  # переход на летнее время и перезапуски не сбивали расписание
  now_h=$(date '+%-H')
  now_m=$(date '+%-M')
  wait_h=$(( (BACKUP_HOUR - now_h + 24) % 24 ))
  [ "$wait_h" -eq 0 ] && wait_h=24
  sleep $(( wait_h * 3600 - now_m * 60 ))

  run
done
