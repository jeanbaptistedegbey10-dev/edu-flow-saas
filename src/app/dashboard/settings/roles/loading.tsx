import {
  PageHeaderSkeleton,
  SkeletonTable,
} from "@/components/dashboard/loading-skeletons";

/** État de chargement instantané de la gestion des rôles & permissions. */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <SkeletonTable rows={6} />
    </div>
  );
}
