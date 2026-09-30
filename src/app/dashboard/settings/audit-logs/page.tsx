import { connection } from "next/server";

import { getCurrentOrganizationId } from "@/lib/session";
import { AuditLogsView } from "@/components/settings/audit-logs-view";

export const metadata = {
  title: "Journal d'audit | EduFlow",
  description: "Consultez l'historique des opérations sensibles réalisées dans votre organisation.",
};

export default async function AuditLogsPage() {
  await connection();

  // Garde de session : redirige vers /login si le contexte est résoluble.
  // L'identifiant n'est PAS transmis au composant — chaque Server Action
  // le recharge depuis la session (isolation multi-tenant).
  await getCurrentOrganizationId();

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Journal d&apos;audit</h1>
        <p className="text-sm text-muted-foreground">
          Historique des opérations sensibles réalisées par les utilisateurs de votre organisation.
        </p>
      </div>
      <AuditLogsView />
    </div>
  );
}
