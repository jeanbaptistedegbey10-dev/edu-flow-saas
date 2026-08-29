import { getCurrentOrganizationProfile } from "@/actions/payments";
import {
  getPosClientOptions,
  getPosStats,
  getProductCategories,
  getProductServices,
} from "@/actions/pos";
import { PosView } from "@/components/pos/pos-view";

export const metadata = {
  title: "Caisse / POS | EduFlow",
  description:
    "Ventes rapides au comptoir : livres, traductions assermentées, photocopies et services annexes.",
};

export default async function PosPage() {
  const [products, categories, clients, stats, organization] = await Promise.all([
    getProductServices(),
    getProductCategories(),
    getPosClientOptions(),
    getPosStats(),
    getCurrentOrganizationProfile(),
  ]);

  return (
    <PosView
      products={products}
      categories={categories}
      clients={clients}
      stats={stats}
      organization={organization}
    />
  );
}