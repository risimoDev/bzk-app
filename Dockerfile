# syntax=docker/dockerfile:1

# ---------- Зависимости ----------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts=false

# ---------- Сборка ----------
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Точка Банк (enter.tochka.com) подписан корневым сертификатом Минцифры, а
# Node его не знает: без этой переменной fetch к банку падает с
# SELF_SIGNED_CERT_IN_CHAIN ещё до авторизации. Из этой стадии собран и
# служебный контейнер tools (сверка, recalc-accounting), поэтому задаём
# здесь тоже. Проверку TLS не отключаем - сертификат добавляется к доверенным
ENV NODE_EXTRA_CA_CERTS=/app/deploy/certs/russian_trusted_root_ca.pem
# Домен нужен на сборке: next.config запекает его в список разрешённых
# источников серверных действий (allowedOrigins). Пусто - проверка идёт
# по фактическому Host, что за Caddy тоже верно
ARG SITE_DOMAIN=""
ENV SITE_DOMAIN=$SITE_DOMAIN
# Публичный ключ капчи Next вшивает в браузерный код на сборке, поэтому
# он нужен здесь, а не только в окружении запуска. Пусто - капчи не будет
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=""
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
# В контейнере Node сам ставит себе низкий предел кучи (~0.5 ГБ), и проверка
# типов в next build падает с "heap out of memory" на VPS с 2 ГБ. Поднимаем
# предел явно: со swap, который создаёт setup-server.sh, сборка проходит.
# Значение можно переопределить build-аргументом на совсем маленькой машине.
ARG NODE_BUILD_MEMORY=2048
ENV NODE_OPTIONS="--max-old-space-size=$NODE_BUILD_MEMORY"
RUN npm run build

# ---------- Прод ----------
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Корневой сертификат Минцифры для запросов к Точка Банку (см. комментарий в
# стадии builder). Копия лежит вне standalone-вывода, читается пользователем
# nextjs; NODE_EXTRA_CA_CERTS Node читает при старте, поэтому это ENV, а не
# переменная приложения из .env
COPY --from=builder --chmod=0644 /app/deploy/certs/russian_trusted_root_ca.pem /app/certs/russian_trusted_root_ca.pem
ENV NODE_EXTRA_CA_CERTS=/app/certs/russian_trusted_root_ca.pem

# standalone кладёт сюда минимальный набор: сервер + только нужные модули
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Загрузки клиентов живут в томе, а не в образе
RUN mkdir -p /app/storage/uploads && chown -R nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
