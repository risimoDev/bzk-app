import NextAuth, { AuthError, CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { credentialsSchema } from "@/lib/validation";
import { consumeTotp } from "@/lib/totp-db";
import { sessionRevoked } from "@/lib/session-policy";
import { clientIp } from "@/lib/client-ip";
import {
  checkRateLimit,
  recordAttempt,
  clearAttempts,
  retryAfterText,
} from "@/lib/rate-limit";

export type UserRole = "user" | "admin" | "manager";

/**
 * Слишком много попыток входа.
 *
 * Наследуемся от CredentialsSignin, иначе Auth.js завернёт исключение в
 * CallbackRouteError и до формы дойдёт «что-то пошло не так». Время
 * ожидания кладём отдельным полем: `code` уходит в адресную строку, и
 * подробностям там не место.
 */
export class TooManyAttemptsError extends CredentialsSignin {
  code = "too_many_attempts";
  constructor(readonly wait: string) {
    super();
  }
}

/**
 * Пароль верный, но нужен одноразовый код.
 *
 * Отдельная ошибка, чтобы форма могла показать поле кода и не говорить
 * «неверная почта или пароль» тому, кто ввёл их правильно.
 */
export class TotpRequiredError extends CredentialsSignin {
  code = "totp_required";
}

/** Код введён, но не подошёл. */
export class TotpInvalidError extends CredentialsSignin {
  code = "totp_invalid";
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      canUseEditor: boolean;
      miniWarehouseEnabled: boolean;
      /** Включён ли второй фактор - по нему админка напоминает о защите. */
      totpEnabled: boolean;
    };
  }

  /** То, что возвращает authorize и что попадает в jwt-колбэк. */
  interface User {
    role?: UserRole;
    canUseEditor?: boolean;
    miniWarehouseEnabled?: boolean;
    /** Момент последней смены пароля (мс) - для отзыва старых сессий. */
    passwordChangedAt?: number;
    /** Версия сессий пользователя на момент входа - для отзыва токенов. */
    sessionVersion?: number;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // Сессия в JWT: провайдер Credentials не умеет работать с адаптером
  // базы, а держать таблицу сессий ради этого незачем. 30 дней - срок
  // клиента; сотрудника колбэк session отзывает через 7 дней от входа
  // (lib/session-policy.ts), а любого - по версии сессий в базе.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },

  pages: { signIn: "/login" },

  logger: {
    // Неверный пароль для Auth.js - ошибка, и по умолчанию она печатается
    // со стеком на десяток строк: каждая опечатка клиента забивала лог.
    // Это штатный отказ, а не поломка, - хватает одной строки. Прочие
    // ошибки выводим так же, как делает Auth.js сам
    error(error) {
      if (error instanceof CredentialsSignin) {
        console.error(`[auth] ${error.type}${error.code ? ` (${error.code})` : ""}: вход отклонён`);
        return;
      }
      const name = error instanceof AuthError ? error.type : error.name;
      console.error(`[auth][error] ${name}: ${error.message}`);
      const cause = error.cause;
      if (cause && typeof cause === "object" && "err" in cause && cause.err instanceof Error) {
        const { err, ...data } = cause as { err: Error } & Record<string, unknown>;
        console.error("[auth][cause]:", err.stack);
        console.error("[auth][details]:", JSON.stringify(data, null, 2));
      } else if (error.stack) {
        console.error(error.stack.replace(/.*/, "").substring(1));
      }
    },
  },

  providers: [
    Credentials({
      credentials: { email: {}, password: {}, totp: {} },

      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        /**
         * Ограничение попыток стоит здесь, а не в действии формы: только
         * тут известно, чем кончилась проверка. Считаем по двум ключам -
         * по почте (подбор пароля к одному аккаунту) и по адресу
         * (перебор аккаунтов подряд с одной машины).
         */
        const ip = await clientIp();
        const byEmail = await checkRateLimit(email, "login");
        const byIp = await checkRateLimit(ip, "loginIp");

        if (!byEmail.ok || !byIp.ok) {
          const wait = Math.max(byEmail.retryAfter, byIp.retryAfter);
          throw new TooManyAttemptsError(retryAfterText(wait));
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);

        // Сравнение выполняем даже когда пользователя нет: иначе по
        // времени ответа можно перебрать, какие адреса зарегистрированы.
        const hash =
          user?.password ??
          "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
        const ok = await bcrypt.compare(password, hash);

        if (!user || !ok || user.isBlocked) {
          // Заблокированный аккаунт тоже считаем неудачей: иначе по нему
          // можно было бы дёргать проверку пароля без ограничений
          await recordAttempt(email, "login");
          await recordAttempt(ip, "loginIp");
          return null;
        }

        // Второй фактор: пароль подошёл, но у сотрудника может быть
        // включён одноразовый код. Проверяем до снятия счётчика попыток -
        // перебор кода тоже должен упираться в ограничение
        if (user.totpEnabledAt && user.totpSecret) {
          const given = String((raw as Record<string, unknown>).totp ?? "").trim();

          if (given === "") {
            await recordAttempt(email, "login");
            await recordAttempt(ip, "loginIp");
            throw new TotpRequiredError();
          }

          // consumeTotp ещё и запоминает код: тот же код второй раз не
          // пройдёт, даже если его подсмотрели или перехватили
          if (!(await consumeTotp(user.id, user.totpSecret, given))) {
            await recordAttempt(email, "login");
            await recordAttempt(ip, "loginIp");
            throw new TotpInvalidError();
          }
        }

        // Вошёл - счётчик по почте снимаем, иначе человек, который часто
        // заходит с разных устройств, запер бы сам себя. Счётчик по адресу
        // не трогаем: иначе подборщик перемежал бы попытки к чужим
        // аккаунтам входами в свой и обнулял бы лимит по адресу сколько
        // угодно раз. Своё окно он отсчитает сам
        await clearAttempts(email, "login");

        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role ?? "user",
          canUseEditor: user.canUseEditor,
          miniWarehouseEnabled: user.miniWarehouseEnabled ?? false,
          // В токен кладём момент последней смены пароля; сессия сверяет
          // его с базой и отзывается, если пароль сменили позже
          passwordChangedAt: user.passwordChangedAt?.getTime() ?? 0,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],

  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.canUseEditor = user.canUseEditor;
        token.miniWarehouseEnabled = user.miniWarehouseEnabled;
        token.pwdAt = user.passwordChangedAt ?? 0;
        token.sv = user.sessionVersion ?? 0;
        // Момент входа: срок сессии сотрудника считается от него, а не от
        // последнего запроса (Auth.js продлевает токен на каждом)
        token.loginAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      const id = Number(token.id);

      // Сессия лежит в JWT и живёт 30 дней, поэтому блокировка или
      // удаление пользователя сами по себе доступ не отбирают: токен
      // остаётся валидным. Сверяемся с базой на каждом чтении сессии -
      // это один запрос по первичному ключу.
      const [fresh] = await db
        .select({
          name: users.name,
          email: users.email,
          role: users.role,
          isBlocked: users.isBlocked,
          canUseEditor: users.canUseEditor,
          miniWarehouseEnabled: users.miniWarehouseEnabled,
          passwordChangedAt: users.passwordChangedAt,
          sessionVersion: users.sessionVersion,
          totpEnabledAt: users.totpEnabledAt,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      // Пароль сменили после того, как выдан этот токен - сессия недействительна
      const changedAt = fresh?.passwordChangedAt?.getTime() ?? 0;
      const issuedFor = Number(token.pwdAt ?? 0);
      if (
        !fresh ||
        fresh.isBlocked ||
        changedAt > issuedFor ||
        // Версия сессий выросла (выход со всех устройств, блокировка,
        // отключение 2FA) или у сотрудника вышла неделя со входа
        sessionRevoked({
          role: fresh.role,
          tokenVersion: token.sv,
          currentVersion: fresh.sessionVersion,
          loginAt: token.loginAt,
        })
      ) {
        // Пустой id - признак недействительной сессии для вызывающего кода
        session.user = { ...session.user, id: "" };
        return session;
      }

      session.user.id = String(id);
      session.user.name = fresh.name;
      session.user.email = fresh.email;
      session.user.role = fresh.role ?? "user";
      // Флаги читаются из базы вместе с остальным: администратор может
      // включить раздел прямо сейчас, и клиенту не придётся перевходить
      session.user.canUseEditor = fresh.canUseEditor;
      session.user.miniWarehouseEnabled = fresh.miniWarehouseEnabled ?? false;
      session.user.totpEnabled = Boolean(fresh.totpEnabledAt);
      return session;
    },
  },
});

/**
 * Текущий пользователь или null.
 *
 * Пользуйтесь этим вместо auth() везде, где нужно решить «пустить или нет»:
 * колбэк session помечает отозванную сессию пустым id, и голая проверка
 * `if (session)` такую сессию пропустила бы.
 */
export async function currentUser() {
  const session = await auth();
  return session?.user?.id ? session.user : null;
}
