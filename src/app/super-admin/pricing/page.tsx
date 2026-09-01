import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { listPlanPricingForSuperAdmin } from "@/actions/super-admin";
import { PricingEditor } from "@/components/super-admin/pricing-editor";
import { getSuperAdminContext } from "@/lib/super-admin";

export const metadata: Metadata = {
  title: "Tarifs & Offres | Back-office EduFlow",
  description:
    "Grille tarifaire dynamique du modèle commercial hybride (acquisition + renouvellement).",
  robots: { index: false, follow: false },
};

/**
 * Page « 💰 Tarifs & Offres » du back-office : édition dynamique de la
 * grille tarifaire (table `PlanPricing`) pour chaque formule commerciale —
 * SaaS Cloud, Self-Hosted Docker et Desktop Offline .exe.
 *
 * Le modèle commercial est hybride :
 * - ACQUISITION  : `initialPrice` (1ʳᵉ année / licence + logiciel), appliqué
 *   tant que l'organisation n'a AUCUNE facture COMPLETED ;
 * - RENOUVELLEMENT : `renewalAnnualPrice` (12 mois) ou
 *   `renewalHalfYearPrice` (6 mois), appliqué automatiquement ensuite par
 *   `calculateSubscriptionPrice()` (checkout en ligne) et utilisé comme
 *   tarif théorique de référence lors de la facturation hors-ligne.
 */
export default async function SuperAdminPricingPage() {
  // Défense en profondeur : le layout redirige déjà, on revalide ici.
  const admin = await getSuperAdminContext();

  if (!admin) {
    redirect("/dashboard");
  }

  const pricingRows = await listPlanPricingForSuperAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          💰 Tarifs &amp; Offres
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Modèle commercial hybride : le{" "}
          <span className="font-medium text-foreground">prix initial</span>{" "}
          (1ʳᵉ année — licence + logiciel) s&apos;applique tant que
          l&apos;organisation n&apos;a aucune facture réglée ; les{" "}
          <span className="font-medium text-foreground">
            tarifs de renouvellement
          </span>{" "}
          (12 ou 6 mois) s&apos;appliquent ensuite automatiquement au checkout
          et servent de référence pour la facturation hors-ligne.
        </p>
      </div>

      <PricingEditor rows={pricingRows} />
    </div>
  );
}
