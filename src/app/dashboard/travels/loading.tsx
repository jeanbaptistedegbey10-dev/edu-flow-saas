import {
  KpiCardsSkeleton,
  PageHeaderSkeleton,
  SkeletonCardsGrid,
} from "@/components/dashboard/loading-skeletons";

/** État de chargement instantané du module voyage (KPI + dossiers). */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <KpiCardsSkeleton count={4} />
      <SkeletonCardsGrid count={6} />
    </div>
  );
}
