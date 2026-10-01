import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DefaultLogoSettingsEditor } from "@/components/super-admin/default-logo-settings-editor";
import { getDefaultOrganizationLogoSetting } from "@/lib/platform-settings";
import { getSuperAdminContext } from "@/lib/super-admin";

export const metadata: Metadata = {
  title: "Paramètres de la plateforme | Back-office EduFlow",
  description:
    "Configuration globale de la plateforme EduFlow (logo par défaut des organisations).",
  robots: { index: false, follow: false },
};

/**
 * Page « Paramètres de la plateforme » du back-office Super-Admin.
 *
 * Elle expose les réglages stockés dans `SystemSettings` qui s'appliquent à
 * TOUTES les organisations — aujourd'hui le logo appliqué par défaut aux
 * nouvelles organisations.
 *
 * Stratégie de résolution du logo (identique à celle des clés de paiement) :
 *   1. valeur enregistrée en base (`SystemSettings`) si elle est valide ;
 *   2. logo EduFlow « /logo.png » sinon.
 */
export default async function SuperAdminSettingsPage() {
  // Défense en profondeur : le layout redirige déjà, on revalide ici.
  const admin = await getSuperAdminContext();

  if (!admin) {
    redirect("/dashboard");
  }

  const setting = await getDefaultOrganizationLogoSetting();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          ⚙️ Paramètres de la plateforme
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Réglages globaux appliqués à l&apos;ensemble des organisations de la
          plateforme EduFlow. Chaque organisation garde la main sur ses propres
          réglages.
        </p>
      </div>

      <section className="rounded-lg border p-6">
        <h2 className="text-lg font-semibold tracking-tight">Identité visuelle</h2>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">
          Logo proposé automatiquement aux centres de formation lors de leur
          création.
        </p>

        <DefaultLogoSettingsEditor
          configuredValue={setting.configuredValue}
          effectiveValue={setting.effectiveValue}
          fallbackValue={setting.fallbackValue}
          isCustomized={setting.isCustomized}
        />
      </section>
    </div>
  );
}
