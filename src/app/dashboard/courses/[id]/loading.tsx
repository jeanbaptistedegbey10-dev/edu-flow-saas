import {
  PageHeaderSkeleton,
  SkeletonTable,
} from "@/components/dashboard/loading-skeletons";

/**
 * État de chargement instantané de la fiche cours : en-tête du cours puis
 * tableau des étudiants inscrits / cahier de texte.
 */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <SkeletonTable rows={6} />
    </div>
  );
}
