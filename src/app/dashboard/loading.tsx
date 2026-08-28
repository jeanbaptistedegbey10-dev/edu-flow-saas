import {
  KpiCardsSkeleton,
  SkeletonChart,
  SkeletonList,
} from "@/components/dashboard/loading-skeletons";

/**
 * État de chargement instantané du tableau de bord : même structure que
 * `DashboardOverview` (cartes KPI, graphiques analytiques, listes rapides).
 */
export default function Loading() {
  return (
    <div className="grid gap-4">
      <KpiCardsSkeleton />

      <div className="grid gap-4 lg:grid-cols-3">
        <SkeletonChart className="lg:col-span-2" />
        <SkeletonChart />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonList rows={5} />
        <SkeletonList rows={5} />
      </div>
    </div>
  );
}
