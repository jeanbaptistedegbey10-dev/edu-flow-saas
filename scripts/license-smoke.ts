/**
 * Test de fumée (Smoke Test) — Licence & abonnement.
 *
 * Exécution :
 *   npx tsx --env-file=.env scripts/license-smoke.ts
 *
 * Lecture seule : ne modifie AUCUNE donnée. Vérifie :
 *   1. Le calcul de la date de fin d'essai (J+30) ;
 *   2. L'évaluation de l'état de licence de la première organisation de la
 *      base (TRIAL actif, jours restants, accès en écriture…).
 */
import { computeTrialEndDate, getLicenseState } from "../src/lib/license-check";
import { prisma } from "../src/lib/prisma";

function assert(condition: boolean, label: string): void {
  if (!condition) {
    console.error(`❌ ÉCHEC : ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ OK : ${label}`);
  }
}

async function main(): Promise<void> {
  console.log("== 1. Calcul de la date de fin d'essai ==");
  const from = new Date("2026-08-01T00:00:00.000Z");
  const end = computeTrialEndDate(from);
  const diffDays = Math.round(
    (end.getTime() - from.getTime()) / 86_400_000
  );
  assert(diffDays === 30, `J+30 = ${end.toISOString()} (écart ${diffDays} j)`);

  console.log("== 2. État de licence de la première organisation ==");
  const organization = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  if (!organization) {
    console.log("ℹ️  Aucune organisation en base — test d'état ignoré.");
    return;
  }

  const state = await getLicenseState(organization.id);

  console.log(`Organisation : ${organization.name} (${organization.id})`);
  console.log({
    planType: state.planType,
    planStatus: state.planStatus,
    trialDaysLeft: state.trialDaysLeft,
    accessEndsAt: state.accessEndsAt?.toISOString() ?? null,
    canWrite: state.canWrite,
    restrictionReason: state.restrictionReason,
    showTrialWarning: state.showTrialWarning,
  });

  assert(typeof state.planType === "string", "planType est une chaîne");
  assert(typeof state.canWrite === "boolean", "canWrite est un booléen");

  // Cohérence des règles d'affichage de la bannière.
  if (state.planStatus === "ACTIVE" && state.restrictionReason === null) {
    assert(
      state.canWrite === true,
      "Plan ACTIVE sans restriction ⇒ accès en écriture"
    );
  }
  if (state.restrictionReason === "TRIAL_EXPIRED") {
    assert(
      state.canWrite === false,
      "Essai expiré ⇒ accès en écriture bloqué"
    );
  }

  console.log("Test de fumée terminé.");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("❌ Erreur fatale du smoke test :", error);
  process.exit(1);
});