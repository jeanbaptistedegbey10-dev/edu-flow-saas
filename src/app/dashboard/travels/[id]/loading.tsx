import {
  KpiCardsSkeleton,
  PageHeaderSkeleton,
  SkeletonList,
  SkeletonTable,
} from "@/components/dashboard/loading-skeletons";

/**
 * État de chargement instantané du dossier voyage : en-tête, suivi des
 * étapes de la procédure et échelonnement financier.
 */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <KpiCardsSkeleton count={3} />
      <SkeletonList rows={5} />
      <SkeletonTable rows={5} />
    </div>
  );
}
