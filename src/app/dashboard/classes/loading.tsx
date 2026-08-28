import {
  PageHeaderSkeleton,
  SkeletonCardsGrid,
} from "@/components/dashboard/loading-skeletons";

/** État de chargement instantané de la gestion des classes / cohortes. */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <SkeletonCardsGrid count={6} />
    </div>
  );
}
