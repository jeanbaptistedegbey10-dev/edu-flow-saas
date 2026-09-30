import { connection } from "next/server";

import { getCurrentOrganizationBranding } from "@/actions/organization";
import { UserManualView } from "@/components/settings/user-manual-view";

export const metadata = {
  title: "Manuel d'Utilisation | EduFlow",
  description:
    "Manuel d'Utilisation officiel d'EduFlow, au format A4 prêt à imprimer.",
};

/**
 * Page « Manuel d'Utilisation » (`/dashboard/guide`).
 *
 * Le Manuel est un document STATIQUE (son contenu vit dans
 * `@/data/user-manual`) : seules l'identité de l'établissement, imprimée en
 * page de garde, et la date d'édition sont résolues côté serveur.
 */
export default async function UserManualPage() {
  // Rendu dynamique : la page reprend le nom de l'organisation courante
  // (identité de session), elle ne peut donc pas être pré-rendue statiquement.
  await connection();

  const branding = await getCurrentOrganizationBranding();

  return <UserManualView organizationName={branding?.name ?? ""} />;
}
