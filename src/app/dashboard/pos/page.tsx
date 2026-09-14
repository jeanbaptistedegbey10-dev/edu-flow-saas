import { getCurrentOrganizationProfile } from "@/actions/payments";
import {
  getPosClientOptions,
  getPosStats,
  getProductCategories,
  getProductServices,
} from "@/actions/pos";
import { getCashSessionStatus } from "@/lib/actions/cash-register";
import { PosView } from "@/components/pos/pos-view";

export const metadata = {
  title: "Caisse / POS | EduFlow",
  description:
    "Ventes rapides au comptoir : livres, traductions assermentées, photocopies et services annexes.",
};

export default async function PosPage() {
  const [products, categories, clients, stats, organization, cashSession] =
    await Promise.all([
      getProductServices(),
      getProductCategories(),
      getPosClientOptions(),
      getPosStats(),
      getCurrentOrganizationProfile(),
      getCashSessionStatus(),
    ]);

  return (
    <PosView
      products={products}
      categories={categories}
      clients={clients}
      stats={stats}
      organization={organization}
      cashSession={cashSession}
    />
  );
}