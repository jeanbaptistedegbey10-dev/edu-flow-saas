import { getCurrentOrganizationProfile } from "@/actions/payments";
import {
  getPosClientOptions,
  getPosStats,
  getProductCategories,
  getProductServices,
} from "@/actions/pos";
import { getCashSessionStatus } from "@/lib/actions/cash-register";
import { getPaymentGatewaysStatus } from "@/lib/payment";
import { PosView } from "@/components/pos/pos-view";

export const metadata = {
  title: "Caisse / POS | EduFlow",
  description:
    "Ventes rapides au comptoir : livres, traductions assermentées, photocopies et services annexes.",
};

export default async function PosPage() {
  const [products, categories, clients, stats, organization, cashSession, gatewayStatus] =
    await Promise.all([
      getProductServices(),
      getProductCategories(),
      getPosClientOptions(),
      getPosStats(),
      getCurrentOrganizationProfile(),
      getCashSessionStatus(),
      getPaymentGatewaysStatus(),
    ]);

  return (
    <PosView
      products={products}
      categories={categories}
      clients={clients}
      stats={stats}
      organization={organization}
      cashSession={cashSession}
      gatewayStatus={gatewayStatus}
    />
  );
}