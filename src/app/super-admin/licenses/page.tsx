import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  listLicenseTargetOrganizations,
} from "@/actions/super-admin";
import { LicenseGenerator } from "@/components/super-admin/license-generator";
import { getSuperAdminContext } from "@/lib/super-admin";

export const metadata: Metadata = {
  title: "Générateur de Licences | Back-office EduFlow",
  description:
    "Générez et signez des clés de licence Ed25519 (SaaS, self-hosted, desktop hors-ligne) pour vos clients.",
  robots: { index: false, follow: false },
};

/**
 * Page « Générateur de Licences » du back-office : sélection d'une
 * organisation existante ou saisie d'une référence client, choix du plan et
 * de l'expiration, puis génération d'une clé `EDU-…` signée via
 * `generateLicenseKey()`.
 */
export default async function SuperAdminLicensesPage() {
  // Défense en profondeur : le layout redirige déjà, on revalide ici.
  const admin = await getSuperAdminContext();

  if (!admin) {
    redirect("/dashboard");
  }

  const organizations = await listLicenseTargetOrganizations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Générateur de Licences
        </h1>
        <p className="text-sm text-muted-foreground">
          Signez des clés Ed25519 pour vos clients SaaS, self-hosted ou desktop
          hors-ligne (SAAS_MONTHLY, SAAS_YEARLY, SELF_HOSTED, OFFLINE,
          DESKTOP_LIFETIME).
        </p>
      </div>

      <LicenseGenerator organizations={organizations} />
    </div>
  );
}