-- CreateEnum
CREATE TYPE "PricingPlanType" AS ENUM ('SAAS_CLOUD', 'SELF_HOSTED', 'DESKTOP_OFFLINE');

-- CreateTable
CREATE TABLE "PlanPricing" (
    "id" TEXT NOT NULL,
    "planType" "PricingPlanType" NOT NULL,
    "initialPrice" INTEGER NOT NULL,
    "renewalAnnualPrice" INTEGER NOT NULL,
    "renewalHalfYearPrice" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanPricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanPricing_planType_key" ON "PlanPricing"("planType");

-- SeedDefaultPricing
-- Grille tarifaire par défaut du modèle commercial hybride (Acquisition +
-- Renouvellement), éditable ensuite dans /super-admin/pricing :
-- - SaaS Cloud      : 1ʳᵉ année 80 000 / renouvellement 12 mois 50 000 / 6 mois 30 000 ;
-- - Self-Hosted     : 1ʳᵉ année 160 000 / renouvellement 12 mois 80 000 / 6 mois 45 000 ;
-- - Desktop Offline : 1ʳᵉ année 160 000 / renouvellement 12 mois 80 000 / 6 mois 45 000.
INSERT INTO "PlanPricing" ("id", "planType", "initialPrice", "renewalAnnualPrice", "renewalHalfYearPrice", "currency", "updatedAt")
VALUES
  ('pricing_saas_cloud', 'SAAS_CLOUD', 80000, 50000, 30000, 'XOF', CURRENT_TIMESTAMP),
  ('pricing_self_hosted', 'SELF_HOSTED', 160000, 80000, 45000, 'XOF', CURRENT_TIMESTAMP),
  ('pricing_desktop_offline', 'DESKTOP_OFFLINE', 160000, 80000, 45000, 'XOF', CURRENT_TIMESTAMP)
ON CONFLICT ("planType") DO NOTHING;
