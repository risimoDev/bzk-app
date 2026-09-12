/**
 * Заводит администратора или повышает существующего пользователя.
 *
 *   node scripts/create-admin.mjs <email> <пароль> ["Имя"]
 *
 * Нужен при первой установке: свежая база пустая, а войти в админку
 * без администратора нельзя. Если пользователь с такой почтой уже есть -
 * поднимаем его до администратора и, если задан пароль, меняем пароль.
 * Идемпотентно: повторный запуск ничего не ломает.
 *
 * Пароль проверяется теми же правилами, что и на сайте.
 */
import pg from "pg";
import bcrypt from "bcryptjs";
import { databaseUrl } from "./db-url.mjs";
import { checkPassword } from "../src/lib/password-policy.ts";

const [email, password, name] = process.argv.slice(2);

if (!email || !password) {
  console.error('Использование: node scripts/create-admin.mjs <email> <пароль> ["Имя"]');
  process.exitCode = 1;
} else {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    console.error("Почта выглядит неправильно.");
    process.exitCode = 1;
  } else {
    const problem = checkPassword(password);
    if (problem) {
      console.error(`Пароль не годится: ${problem.toLowerCase()}.`);
      process.exitCode = 1;
    } else {
      const client = new pg.Client({ connectionString: databaseUrl() });
      await client.connect();
      try {
        const hash = bcrypt.hashSync(password, 10);
        const { rows } = await client.query(
          "SELECT id, role FROM users WHERE lower(email) = $1 LIMIT 1",
          [normalized],
        );

        if (rows.length > 0) {
          await client.query(
            "UPDATE users SET role = 'admin', password = $1, is_blocked = false WHERE id = $2",
            [hash, rows[0].id],
          );
          console.log(`Пользователь ${normalized} (#${rows[0].id}) стал администратором, пароль обновлён.`);
        } else {
          const { rows: created } = await client.query(
            "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, 'admin') RETURNING id",
            [name?.trim() || "Администратор", normalized, hash],
          );
          console.log(`Создан администратор ${normalized} (#${created[0].id}).`);
        }
      } finally {
        await client.end();
      }
    }
  }
}
