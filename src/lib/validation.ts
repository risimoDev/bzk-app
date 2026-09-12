import { z } from "zod";
import { checkPassword } from "@/lib/password-policy";
import { isDisposableEmail, DISPOSABLE_EMAIL_MESSAGE } from "@/lib/email-guard";

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/**
 * Регистрация.
 *
 * Требования к паролю - из lib/password-policy.ts, те же, что были на
 * старом сайте (длина, регистр, цифра). Существующих паролей это не
 * касается: проверка только на заведении нового.
 */
export const registerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Укажите имя")
      .max(255, "Слишком длинное имя"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Проверьте адрес почты")
      .max(255)
      .refine((e) => !isDisposableEmail(e), DISPOSABLE_EMAIL_MESSAGE),
    phone: z
      .string()
      .trim()
      .max(20)
      .optional()
      .or(z.literal("")),
    password: z
      .string()
      .superRefine((value, ctx) => {
        const problem = checkPassword(value);
        if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
      }),
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: "Пароли не совпадают",
    path: ["passwordConfirm"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
