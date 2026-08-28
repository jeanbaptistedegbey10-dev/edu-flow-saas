import {
  PageHeaderSkeleton,
  SkeletonCardsGrid,
  ToolbarSkeleton,
} from "@/components/dashboard/loading-skeletons";

/** État de chargement instantané du catalogue de cours. */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <ToolbarSkeleton />
      <SkeletonCardsGrid count={6} />
    </div>
  );
}
