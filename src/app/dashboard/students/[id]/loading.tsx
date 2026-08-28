import {
  KpiCardsSkeleton,
  PageHeaderSkeleton,
  SkeletonTabs,
} from "@/components/dashboard/loading-skeletons";

/**
 * État de chargement instantané de la fiche étudiant : en-tête (retour +
 * identité + contact), synthèse financière et onglets de contenu détaillé.
 */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />
      <KpiCardsSkeleton count={3} />
      <SkeletonTabs tabs={3} />
    </div>
  );
}
