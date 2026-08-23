import { getDashboardStats } from "@/actions/dashboard";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

export const metadata = {
  title: "Tableau de bord | EduFlow",
  description:
    "Vue d'ensemble de l'activité : étudiants, chiffre d'affaires, dossiers de voyage et formations.",
};

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return <DashboardOverview stats={stats} />;
}