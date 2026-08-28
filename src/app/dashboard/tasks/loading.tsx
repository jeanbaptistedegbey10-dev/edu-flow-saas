import {
  PageHeaderSkeleton,
  SkeletonTable,
  ToolbarSkeleton,
} from "@/components/dashboard/loading-skeletons";

/** État de chargement instantané de la gestion des tâches. */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <ToolbarSkeleton />
      <SkeletonTable rows={7} />
    </div>
  );
}
