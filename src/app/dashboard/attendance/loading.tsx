import {
  PageHeaderSkeleton,
  SkeletonTable,
} from "@/components/dashboard/loading-skeletons";

/** État de chargement instantané des présences & cahier de texte. */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <SkeletonTable rows={6} />
    </div>
  );
}
