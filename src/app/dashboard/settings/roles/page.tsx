import { auth } from "@/auth";
import { getRolesOverview } from "@/actions/roles";
import { RolesView } from "@/components/settings/roles-view";
import { ShieldAlertIcon } from "lucide-react";

export const metadata = {
  title: "Rôles & Permissions | EduFlow",
  description:
    "Créez des rôles personnalisés (ex : Secrétaire Adjoint) et attribuez-leur des permissions.",
};

/**
 * Page Rôles & Permissions : réservée aux administrateurs. Les autres profils
 * obtiennent un message d'accès restreint (aucune donnée n'est chargée).
 */
export default async function RolesPage() {
  const session = await auth();
  const role = session?.user?.role;
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";

  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-500/30 dark:bg-amber-500/10">
          <ShieldAlertIcon className="mx-auto size-10 text-amber-500" />
          <h2 className="mt-3 text-lg font-semibold">Accès restreint</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Seuls les administrateurs de l&apos;établissement peuvent consulter
            et gérer les rôles et les permissions.
          </p>
        </div>
      </div>
    );
  }

  const overview = await getRolesOverview();

  return <RolesView overview={overview} />;
}