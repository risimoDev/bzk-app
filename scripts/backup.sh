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
# Восстановление базы:
#   gunzip -c backups/bzk-2026-09-06-0300.sql.gz | \
#     docker compose exec -T db psql -U bzk -d bzk
#
# Восстановление файлов:
#   docker compose exec -T app tar -xzf - -C /app/storage/uploads \
#     < backups/uploads-2026-09-06-0300.tar.gz
set -eu

: "${POSTGRES_USER:=bzk}"
: "${POSTGRES_DB:=bzk}"
: "${RETAIN_DAYS:=14}"
: "${UPLOADS_RETAIN_DAYS:=7}"
# Час ночного запуска по часовому поясу контейнера
: "${BACKUP_HOUR:=3}"
# Куда примонтирован том с файлами. Нет папки - архив пропускаем
: "${UPLOADS_DIR:=/uploads}"

log() { echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

dump() {
  stamp=$(date '+%Y-%m-%d-%H%M')
  file="/backups/${POSTGRES_DB}-${stamp}.sql.gz"

  if pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "$file.part"; then
    mv "$file.part" "$file"
    log "база: $file ($(du -h "$file" | cut -f1))"
  else
    # Недоделанный дамп хуже отсутствующего: по имени его не отличить
    # от целого, и восстановление из него оборвётся на середине
    rm -f "$file.part"
    log "ОШИБКА: дамп не собрался"
    return 1
  fi

  find /backups -name "${POSTGRES_DB}-*.sql.gz" -mtime "+$RETAIN_DAYS" -print -delete |
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

  find /backups -name "uploads-*.tar.gz" -mtime "+$UPLOADS_RETAIN_DAYS" -print -delete |
    while read -r old; do log "удалён старый: $old"; done
}

run() {
  # Ошибка одного не должна отменять другое: дамп без файлов всё равно
  # лучше, чем ничего
  dump || true
  archive_uploads || true
}

log "запущен: в ${BACKUP_HOUR}:00; база хранится ${RETAIN_DAYS} дн., файлы - ${UPLOADS_RETAIN_DAYS} дн."

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
