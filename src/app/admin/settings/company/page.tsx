import type { Metadata } from "next";
import { AdminPage, AdminEmpty } from "@/components/admin/AdminPage";
import { can } from "@/lib/permissions";
import {
  missingFields,
  REQUIRED_FOR_DOCUMENTS,
  REQUIRED_FOR_QR,
  COMPANY_FIELDS,
} from "@/lib/company";
import { readCompany } from "@/lib/company-db";
import { CompanyForm } from "./CompanyForm";

export const metadata: Metadata = {
  title: "Реквизиты · Админка",
  robots: { index: false, follow: false },
};

export default async function CompanySettingsPage() {
  if (!(await can("settings", "view"))) {
    return (
      <AdminPage title="Реквизиты">
        <AdminEmpty title="Нет доступа" text="У вашей роли нет права смотреть настройки." />
      </AdminPage>
    );
  }

  const company = await readCompany();
  const canEdit = await can("settings", "edit");

  const noDocs = missingFields(company, REQUIRED_FOR_DOCUMENTS);
  const noQr = missingFields(company, REQUIRED_FOR_QR);

  return (
    <AdminPage
      title="Реквизиты"
      subtitle="Подставляются в счета, акты и универсальный передаточный документ"
    >
      {(noDocs.length > 0 || noQr.length > 0) && (
        <div className="mb-6 max-w-3xl rounded-xl border border-warn/30 bg-warn/8 px-5 py-4 text-sm">
          <p className="font-display text-[0.62rem] tracking-[0.18em] text-warn">
            ЧТО ЕЩЁ НУЖНО ЗАПОЛНИТЬ
          </p>
          <ul className="mt-2.5 flex flex-col gap-1.5 text-ink/70">
            {noDocs.length > 0 && (
              <li>
                <b className="text-ink">Документы:</b>{" "}
                {noDocs.map((f) => COMPANY_FIELDS[f].toLowerCase()).join(", ")} - без этого
                счёт и УПД выйдут с пустыми графами.
              </li>
            )}
            {noQr.length > 0 && (
              <li>
                <b className="text-ink">Платёжный QR-код:</b>{" "}
                {noQr.map((f) => COMPANY_FIELDS[f].toLowerCase()).join(", ")} - код на счёте
                не печатается, пока не заполнены все банковские поля.
              </li>
            )}
          </ul>
        </div>
      )}

      <CompanyForm company={company} canEdit={canEdit} />
    </AdminPage>
  );
}
