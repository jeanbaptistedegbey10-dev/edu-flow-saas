import { getCurrentOrganizationProfile } from "@/actions/payments";
import {
  getPosClientOptions,
  getPosStats,
  getProductServices,
} from "@/actions/pos";
import { PosView } from "@/components/pos/pos-view";

export const metadata = {
  title: "Caisse / POS | EduFlow",
  description:
    "Ventes rapides au comptoir : livres, traductions assermentées, photocopies et services annexes.",
};

export default async function PosPage() {
  const [products, clients, stats, organization] = await Promise.all([
    getProductServices(),
    getPosClientOptions(),
    getPosStats(),
    getCurrentOrganizationProfile(),
  ]);

  return (
    <PosView
      products={products}
      clients={clients}
      stats={stats}
      organization={organization}
    />
  );
}