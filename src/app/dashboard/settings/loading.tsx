import {
  PageHeaderSkeleton,
  SkeletonForm,
  SkeletonTabs,
} from "@/components/dashboard/loading-skeletons";

/** État de chargement instantané des paramètres (onglets + profil). */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <SkeletonTabs tabs={4} />
      <SkeletonForm fields={4} />
    </div>
  );
}
