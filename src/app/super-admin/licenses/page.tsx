import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  listLicenseTargetOrganizations,
  listPlanPricingForSuperAdmin,
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
 *
 * La grille tarifaire dynamique (table `PlanPricing`) est chargée et
 * transmise au générateur : le tarif théorique correspondant (acquisition ou
 * renouvellement selon l'historique de facturation du client) s'affiche en
 * continu pour référence lors de la facturation hors-ligne.
 */
export default async function SuperAdminLicensesPage() {
  // Défense en profondeur : le layout redirige déjà, on revalide ici.
  const admin = await getSuperAdminContext();

  if (!admin) {
    redirect("/dashboard");
  }

  const [organizations, pricingRows] = await Promise.all([
    listLicenseTargetOrganizations(),
    listPlanPricingForSuperAdmin(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Générateur de Licences
        </h1>
        <p className="text-sm text-muted-foreground">
          Signez des clés Ed25519 pour vos clients SaaS, self-hosted ou desktop
          hors-ligne (SAAS_MONTHLY, SAAS_HALF_YEAR, SAAS_YEARLY, SELF_HOSTED,
          OFFLINE, DESKTOP_LIFETIME). Le tarif théorique de la grille dynamique
          est affiché en continu pour la facturation hors-ligne.
        </p>
      </div>

      <LicenseGenerator organizations={organizations} pricingRows={pricingRows} />
    </div>
  );
}
