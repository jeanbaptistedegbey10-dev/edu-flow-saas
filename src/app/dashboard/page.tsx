import { connection } from "next/server";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  getAttendanceTrendAction,
  getCashFlowAction,
  getDashboardStatsAction,
  getFinancialOverviewAction,
  getStudentDistributionAction,
} from "@/actions/analytics";
import { getTeacherDashboardStats } from "@/actions/dashboard";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { DemoDataCard } from "@/components/dashboard/demo-data-card";
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
  // /super-admin. Le proxy (src/proxy.ts) applique déjà cette règle en amont
  // sur le JWT de session ; ce garde-fou côté page couvre le cas d'un jeton
  // obsolète (rôle mis à jour en base sans reconnexion) et toute navigation
  // directe vers /dashboard.
  if (role === "SUPER_ADMIN") {
    redirect("/super-admin");
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
  const [stats, financialOverview, cashFlow, distribution, attendanceTrend] =
    await Promise.all([
      getDashboardStatsAction(),
      getFinancialOverviewAction(),
      getCashFlowAction(),
      getStudentDistributionAction(),
      getAttendanceTrendAction(),
    ]);

  // Le rôle SUPER_ADMIN a été redirigé ci-dessus : la gestion des données de
  // démonstration reste réservée aux administrateurs du centre.
  const isAdmin = role === "ADMIN";

  return (
    <div className="grid gap-6">
      <DashboardOverview
        stats={stats}
        financialOverview={financialOverview}
        cashFlow={cashFlow}
        distribution={distribution}
        attendanceTrend={attendanceTrend}
      />

      {/* Gestion des données de démonstration (injection / réinitialisation) */}
      <DemoDataCard isAdmin={isAdmin} />
    </div>
  );
}
