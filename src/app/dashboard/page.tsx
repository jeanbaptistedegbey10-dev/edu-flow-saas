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
import { TeacherDashboardOverview } from "@/components/dashboard/teacher-dashboard-overview";

export const metadata = {
  title: "Tableau de bord | EduFlow",
  description:
    "Vue analytique du centre : recettes mensuelles, impayés, répartition des apprenants et assiduité, ventilée par source.",
};

export default async function DashboardPage() {
  const session = await auth();
  const isTeacher = session?.user?.role === "TEACHER";

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

  return (
    <DashboardOverview
      stats={stats}
      financialOverview={financialOverview}
      cashFlow={cashFlow}
      distribution={distribution}
      attendanceTrend={attendanceTrend}
    />
    );
}
