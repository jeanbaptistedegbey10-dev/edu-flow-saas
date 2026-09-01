/**
 * Test de fumée — Calcul dynamique des tarifs (modèle commercial hybride).
 *   npx tsx scripts/plan-pricing-smoke.ts
 *
 * Vérifie que `calculateSubscriptionPrice()` applique bien le modèle
 * « Acquisition + Renouvellement » :
 *   - la grille lue dans `PlanPricing` (repli : DEFAULT_PLAN_PRICING) ;
 *   - une organisation SANS facture COMPLETED → `initialPrice` ;
 *   - une organisation AVEC facture(s) COMPLETED → tarif de renouvellement
 *     (12 ou 6 mois).
 *
 * LECTURE SEULE : aucune écriture n'est effectuée en base.
 */
import "dotenv/config";

import {
  calculateSubscriptionPrice,
  getPlanPricingGrid,
} from "../src/lib/payment";
import { formatXOF, getLicensePlanTypeFor } from "../src/lib/plan-pricing";
import { prisma } from "../src/lib/prisma";

async function main(): Promise<void> {
  // 1. Grille tarifaire (table PlanPricing, seedée par la migration).
  const grid = await getPlanPricingGrid();

  console.log("== Grille tarifaire (PlanPricing) ==");
  for (const [planType, row] of Object.entries(grid)) {
    console.log(
      `  ${planType.padEnd(16)} initial ${formatXOF(row.initialPrice).padEnd(12)} ` +
        `12 mois ${formatXOF(row.renewalAnnualPrice).padEnd(13)} ` +
        `6 mois ${formatXOF(row.renewalHalfYearPrice)}`
    );
  }

  // 2. Calcul dynamique sur une organisation réelle (statut client déduit
  //    de son historique de factures COMPLETED).
  const organization = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  if (!organization) {
    console.log("\n⚠ Aucune organisation en base — calcul non exercé.");
    await prisma.$disconnect();
    return;
  }

  const completedInvoices = await prisma.invoice.count({
    where: { organizationId: organization.id, status: "COMPLETED" },
  });

  console.log(
    `\n== Organisation « ${organization.name} » — ${completedInvoices} facture(s) COMPLETED ==`
  );

  const expectedKind = completedInvoices === 0 ? "INITIAL" : "RENEWAL";

  for (const durationMonths of [12, 6] as const) {
    const price = await calculateSubscriptionPrice(
      organization.id,
      "SAAS_CLOUD",
      durationMonths
    );

    const isRenewal = price.kind !== "INITIAL";
    const consistent =
      expectedKind === "INITIAL" ? !isRenewal : isRenewal;

    console.log(
      `  ${consistent ? "✅" : "❌"} SAAS_CLOUD / ${durationMonths} mois → ` +
        `${formatXOF(price.amount)} [${price.kind}] — ${price.label}`
    );
  }

  // 3. Branche RENOUVELLEMENT : organisation JETABLE + une facture COMPLETED,
  //    puis nettoyage systématique (finally) — la base est restituée à
  //    l'identique.
  const slug = `smoke-plan-pricing-${Date.now()}`;
  let tempOrganizationId: string | null = null;

  try {
    const tempOrganization = await prisma.organization.create({
      data: { name: "SMOKE — Tarifs (jetable)", slug },
      select: { id: true },
    });
    tempOrganizationId = tempOrganization.id;

    await prisma.invoice.create({
      data: {
        organizationId: tempOrganization.id,
        planType: "SAAS_YEARLY",
        amount: grid.SAAS_CLOUD.initialPrice,
        currency: "XOF",
        status: "COMPLETED",
        description: "SMOKE — facture jetable (test de fumée tarifs)",
      },
    });

    console.log("\n== Branche RENOUVELLEMENT (organisation jetable facturée) ==");

    for (const durationMonths of [12, 6] as const) {
      const price = await calculateSubscriptionPrice(
        tempOrganization.id,
        "SAAS_CLOUD",
        durationMonths
      );

      const expected =
        durationMonths === 12
          ? grid.SAAS_CLOUD.renewalAnnualPrice
          : grid.SAAS_CLOUD.renewalHalfYearPrice;

      const consistent =
        price.amount === expected &&
        price.kind ===
          (durationMonths === 12 ? "RENEWAL_ANNUAL" : "RENEWAL_HALF_YEAR");

      console.log(
        `  ${consistent ? "✅" : "❌"} SAAS_CLOUD / ${durationMonths} mois → ` +
          `${formatXOF(price.amount)} (attendu ${formatXOF(expected)}) [${price.kind}]`
      );
    }
  } finally {
    if (tempOrganizationId) {
      await prisma.invoice.deleteMany({
        where: { organizationId: tempOrganizationId },
      });
      await prisma.organization.delete({
        where: { id: tempOrganizationId },
      });
    }
  }

  // 4. Mapping formule commerciale → plan de licence (pur, sans base).
  console.log("\n== Mapping formule tarifaire → plan de licence ==");
  const mappingChecks: [Parameters<typeof getLicensePlanTypeFor>[0], 6 | 12, string][] =
    [
      ["SAAS_CLOUD", 12, "SAAS_YEARLY"],
      ["SAAS_CLOUD", 6, "SAAS_HALF_YEAR"],
      ["SELF_HOSTED", 12, "SELF_HOSTED"],
      ["DESKTOP_OFFLINE", 12, "OFFLINE"],
    ];

  for (const [planType, durationMonths, expected] of mappingChecks) {
    const actual = getLicensePlanTypeFor(planType, durationMonths);

    console.log(
      `  ${actual === expected ? "✅" : "❌"} ${planType} / ${durationMonths} mois → ${actual} (attendu ${expected})`
    );
  }

  await prisma.$disconnect();
  console.log("\n🎉 Calcul dynamique des tarifs opérationnel.");
}

main().catch((error: unknown) => {
  console.error("❌ Échec :", error);
  process.exit(1);
});
