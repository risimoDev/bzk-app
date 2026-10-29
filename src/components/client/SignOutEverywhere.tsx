"use client";

import { LogOut } from "lucide-react";
import { logoutEverywhere } from "@/app/actions/session";
import { ConfirmButton } from "@/components/ui/ConfirmButton";

/**
 * «Выйти со всех устройств» - с подтверждением: кнопка закрывает и эту
 * вкладку, и все остальные сессии, и случайный клик не должен выкидывать
 * человека из работы.
 */
export function SignOutEverywhere() {
  return (
    <form action={logoutEverywhere}>
      <ConfirmButton
        title="Выйти со всех устройств?"
        text="Все открытые сессии, включая эту, закроются. Чтобы продолжить, придётся войти снова - на каждом устройстве отдельно."
        confirmLabel="Выйти везде"
        className="flex items-center gap-2 rounded-pill border border-ink/20 px-5 py-2.5 text-sm text-ink/70 transition-colors hover:border-danger hover:text-danger"
      >
        <LogOut className="size-4" aria-hidden />
        Выйти со всех устройств
      </ConfirmButton>
    </form>
  );
}
