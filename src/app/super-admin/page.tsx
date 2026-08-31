import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { listOrganizationsForSuperAdmin } from "@/actions/super-admin";
import { OrganizationsView } from "@/components/super-admin/organizations-view";
import { getSuperAdminContext } from "@/lib/super-admin";

export const metadata: Metadata = {
  title: "Organisations | Back-office EduFlow",
  robots: { index: false, follow: false },
};

/**
 * Vue « Organisations » du back-office : liste complète avec plan, statut,
 * fin d'essai/licence, date de création et actions (licence, essai, statut).
 */
export default async function SuperAdminOrganizationsPage() {
  // Défense en profondeur : le layout redirige déjà, on revalide ici
  // (la page ne doit rien charger si le rôle n'est pas SUPER_ADMIN).
  const admin = await getSuperAdminContext();

  if (!admin) {
    redirect("/dashboard");
  }

  const { organizations, stats } = await listOrganizationsForSuperAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Organisations
        </h1>
        <p className="text-sm text-muted-foreground">
          Gérez les plans, licences et accès des centres de formation clients.
        </p>
      </div>

      <OrganizationsView organizations={organizations} stats={stats} />
    </div>
  );
}
