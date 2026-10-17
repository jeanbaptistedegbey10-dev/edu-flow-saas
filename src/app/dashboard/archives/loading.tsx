import {
  PageHeaderSkeleton,
  SkeletonCardsGrid,
} from "@/components/dashboard/loading-skeletons";

/** État de chargement instantané des archives (classes clôturées). */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <SkeletonCardsGrid count={4} />
    </div>
  );
}
