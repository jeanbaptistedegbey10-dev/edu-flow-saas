import {
  PageHeaderSkeleton,
  SkeletonForm,
} from "@/components/dashboard/loading-skeletons";

/** État de chargement instantané de la fiche organisation. */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <SkeletonForm fields={6} />
    </div>
  );
}
