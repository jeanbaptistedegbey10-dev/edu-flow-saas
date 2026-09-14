import {
  PageHeaderSkeleton,
  SkeletonTable,
} from "@/components/dashboard/loading-skeletons";

/** État de chargement instantané de la feuille d'appel mobile. */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <SkeletonTable rows={8} />
    </div>
  );
}
