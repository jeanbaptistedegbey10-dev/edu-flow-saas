import {
  PageHeaderSkeleton,
  SkeletonCardsGrid,
  SkeletonTable,
} from "@/components/dashboard/loading-skeletons";

/** État de chargement instantané de la caisse / POS (produits + panier). */
export default function Loading() {
  return (
    <div className="grid gap-6">
      <PageHeaderSkeleton />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <SkeletonCardsGrid count={6} />
        <SkeletonTable rows={5} />
      </div>
    </div>
  );
}
