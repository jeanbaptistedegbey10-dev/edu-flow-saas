import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getPaymentSettingsAction } from "@/actions/super-admin";
import { PaymentSettingsEditor } from "@/components/super-admin/payment-settings-editor";
import { getSuperAdminContext } from "@/lib/super-admin";

export const metadata: Metadata = {
  title: "Paiements & API | Back-office EduFlow",
  description:
    "Configuration des clés API de paiement (KKiaPay, FedaPay) — mode Test/Live.",
  robots: { index: false, follow: false },
};

/**
 * Page « Paiements & API » du back-office Super-Admin : sauvegarde des clés
 * API de paiement (KKiaPay + FedaPay) et sélection du mode Test/Live.
 *
 * Stratégie de résolution des clés :
 *   1. Valeur en base de données (`SystemSettings`) si renseignée ;
 *   2. Fallback sur la variable d'environnement correspondante ;
 *   3. Valeur par défaut sinon.
 *
 * L'UI indique visuellement la source de chaque clé (base vs env) pour
 * permettre au Super-Admin de comprendre quelle configuration est active.
 */
export default async function SuperAdminPaymentsPage() {
  // Défense en profondeur : le layout redirige déjà, on revalide ici.
  const admin = await getSuperAdminContext();

  if (!admin) {
    redirect("/dashboard");
  }

  const settings = await getPaymentSettingsAction();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          💳 Paiements &amp; API
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Configurez les clés de vos agrégateurs de paiement. Les valeurs
          enregistrées en base priment sur les variables d&apos;environnement —
          un repli transparent garantit le fonctionnement même si une clé
          n&apos;est pas renseignée dans l&apos;interface.
        </p>
      </div>

      <PaymentSettingsEditor settings={settings} />
    </div>
  );
}
