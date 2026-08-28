import {
  PageHeaderSkeleton,
  SkeletonTable,
  ToolbarSkeleton,
} from "@/components/dashboard/loading-skeletons";

/** État de chargement instantané des dépenses. */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <ToolbarSkeleton />
      <SkeletonTable rows={7} />
    </div>
  );
}
