import { connection } from "next/server";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getSuperAdminRoute } from "@/lib/super-admin-route";
import { getOrganizationDataPresence } from "@/lib/demo-data";
import { isDemoDataFeatureEnabled } from "@/lib/demo-data-feature";
import { listOrganizationBackupsAction } from "@/lib/actions/organization-backup";
import { getClassOptions } from "@/actions/classes";
import { getDefaultRegistrationFee } from "@/actions/organization";
import {
  getAttendanceTrendAction,
  getDashboardStatsAction,
  getFinancialOverviewAction,
  getStudentDistributionAction,
} from "@/actions/analytics";
import { getTeacherDashboardStats } from "@/actions/dashboard";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { DemoDataCard } from "@/components/dashboard/demo-data-card";
import { BackupHistory } from "@/components/dashboard/backup-history-section";
import { TeacherDashboardOverview } from "@/components/dashboard/teacher-dashboard-overview";

export const metadata = {
  title: "Tableau de bord | EduFlow",
  description:
    "Vue analytique du centre : recettes mensuelles, impayés, répartition des apprenants et assiduité, ventilée par source.",
};

export default async function DashboardPage() {
  // Rendu dynamique SSR garanti : `connection()` interrompt tout pré-rendu
  // statique de la page (doc locale Next.js 16, à la place des exports de
  // segment `dynamic`/`revalidate`). La page dépend de la session (cookies) :
  // elle doit être servie à la demande, jamais générée au build.
  await connection();

  const session = await auth();
  const role = session?.user?.role;

  // --------------------------------------
  // Super-Admin : espace de travail dédié
  // --------------------------------------
  // Un utilisateur portant le rôle SUPER_ADMIN (administrateur de la
  // PLATEFORME EduFlow) ne doit jamais atterrir sur le tableau de bord d'un
  // centre de formation client : redirection immédiate vers son back-office
  // (route obfusquée — par défaut /portal-sys-admin-sec, jamais /super-admin
  // qui renvoie désormais un 404). Le proxy (src/proxy.ts) applique déjà
  // cette règle en amont sur le JWT de session ; ce garde-fou côté page couvre
  // le cas d'un jeton obsolète (rôle mis à jour en base sans reconnexion) et
  // toute navigation directe vers /dashboard.
  if (role === "SUPER_ADMIN") {
    redirect(getSuperAdminRoute());
  }

  const isTeacher = role === "TEACHER";

  // Les enseignants reçoivent une vue strictement pédagogique :
  // AUCUNE donnée financière (paiements, chiffre d'affaires, POS, impayés).
  if (isTeacher) {
    const stats = await getTeacherDashboardStats();

    return <TeacherDashboardOverview stats={stats} />;
  }

  // Vue analytique globale : les données sont calculées serveur et
  // transmises aux composants clients (graphiques Recharts inclus).
  // La trésorerie (cash flow) vit désormais dans la page dédiée
  // /dashboard/tresorerie — elle n'est plus chargée ici.
  // Les options de classes + frais d'inscription alimentent les raccourcis
  // « Nouvel apprenant » / « Ajouter un prospect » (modale de création).
  const [
    stats,
    financialOverview,
    distribution,
    attendanceTrend,
    classes,
    registrationFee,
  ] = await Promise.all([
    getDashboardStatsAction(),
    getFinancialOverviewAction(),
    getStudentDistributionAction(),
    getAttendanceTrendAction(),
    getClassOptions(),
    getDefaultRegistrationFee(),
  ]);

  // Le rôle SUPER_ADMIN a été redirigé ci-dessus vers son back-office : sur cette
  // page, la gestion des données de démonstration est réservée aux
  // administrateurs du centre. SUPER_ADMIN figure malgré tout dans la liste
  // pour rester cohérent avec les Server Actions (qui, elles, autorisent
  // ADMIN / SUPER_ADMIN) si la redirection évolue un jour.
  const ADMIN_ROLES: ReadonlyArray<string> = ["ADMIN", "SUPER_ADMIN"];
  const isAdmin = ADMIN_ROLES.includes(role ?? "");

  // --------------------------------------
  // Affichage de la carte « Données de démonstration »
  // --------------------------------------
  // La carte (injection / réinitialisation) et l'« Historique des sauvegardes »
  // sont rendues par DÉFAUT, y compris en production : le garde est désormais
  // OPT-OUT (`NEXT_PUBLIC_ENABLE_DEMO_DATA` vaut « false » pour masquer).
  // L'ancienne règle exigeait `NODE_ENV !== "production"`, ce qui rendait la
  // condition toujours fausse sur Vercel (NODE_ENV y vaut toujours
  // « production ») et faisait disparaître ces blocs du tableau de bord.
  // Les Server Actions rejouent la MÊME règle côté serveur
  // (src/lib/actions/demo-data.ts) — défense en profondeur.
  const showDemoData = isDemoDataFeatureEnabled();

  // Deletion guard de la carte démo : l'organisation contient-elle des données
  // (démonstration ou réelles) ? Sans donnée, « Supprimer la démo » est inactif.
  // La requête n'est jouée que lorsque la carte est rendue.
  const dataPresence = showDemoData
    ? await getOrganizationDataPresence(session?.user?.organizationId)
    : { hasData: false, demoAccounts: 0 };

  // Historique des sauvegardes : alimenté par les sauvegardes automatiques
  // créées AVANT chaque purge. La requête n'est jouée que pour les
  // administrateurs (les autres n'ont aucun droit de restauration) et quand la
  // carte démo est rendue.
  const backups =
    showDemoData && isAdmin
      ? await listOrganizationBackupsAction()
      : [];

  return (
    <div className="grid gap-6">
      <DashboardOverview
        stats={stats}
        financialOverview={financialOverview}
        distribution={distribution}
        attendanceTrend={attendanceTrend}
        classes={classes}
        registrationFee={registrationFee}
      />

      {/* Gestion des données de démonstration (injection / réinitialisation) —
          rendue par défaut, y compris en production (cf. showDemoData). */}
      {showDemoData ? (
        <DemoDataCard isAdmin={isAdmin} hasData={dataPresence.hasData} />
      ) : null}

      {/* Historique des sauvegardes + restauration (après une suppression). */}
      {showDemoData ? (
        <BackupHistory
          backups={backups}
          isAdmin={isAdmin}
          hasData={dataPresence.hasData}
        />
      ) : null}
    </div>
  );
}
