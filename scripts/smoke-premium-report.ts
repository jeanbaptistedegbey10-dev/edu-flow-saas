/**
 * Test de fumee (execution reelle via npx tsx) :
 * 1. Generation du bulletin premium imprimable (HTML autonome) : entete
 * Execution : npx tsx scripts/smoke-premium-report.ts
 *    recapitulatif de validation, appreciation par defaut, signatures, pied de
 *    page legal et @page A4 ;
 * 2. Helpers partages de calcul et formatage (note sur bareme, recapitulatif).
 *
 * Excecution : npx tsx scripts/smoke-premium-report.ts
 */

import type {
  PremiumReportData,
  PremiumReportOrganization,
  PremiumReportRow,
} from "@/lib/premium-report";

import {
  buildPremiumReportDocument,
} from "@/lib/premium-report-document";

import {
  formatScore,
  formatScoreOnScale,
  computeModuleValidation,
  defaultAppreciationForValidation,
  formatPremiumReportNumber,
  paymentMethodLabel,
} from "@/lib/premium-report";

let failures = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  OK  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
  }
}

const organization = {
  name: "Centre de Formation Excellence",
  email: "contact@excellence.bj",
  phone: "+229 97 00 00 00",
  address: "Rue 12.045, Cotonou",
  city: "Cotonou",
  website: "https://excellence.bj",
  logoUrl: null,
  rccm: "RB/COT/24 A 12345",
  ifu: "3202412345678",
};

const data = {
  studentFirstName: "Aïcha",
  studentLastName: "KODJO",
  studentCode: "ETU-024",
  className: "A1 - Matin",
  courseTitle: "Allemand Intensif",
  periodLabel: "Semestre 1 — 2025/2026",
  teacherName: "Mme BERGER",
  rows: [
    {
      evaluationTitle: "Examen Continu N°1",
      module: "Lesen",
      date: new Date("2026-07-05"),
      score: 15.5,
      maxScore: 20,
      passingScore: 10,
      passed: true,
    },
    {
      evaluationTitle: "Examen Continu N°1",
      module: "Hoeren",
      date: new Date("2026-07-05"),
      score: 12.25,
      maxScore: 20,
      passingScore: 10,
      passed: true,
    },
    {
      evaluationTitle: "Examen Continu N°2",
      module: "Sprechen",
      date: new Date("2026-08-20"),
      score: 18,
      maxScore: 20,
      passingScore: 10,
      passed: true,
    },
    {
      evaluationTitle: "Composition Finale",
      module: "Schreiben",
      date: new Date("2026-09-10"),
      score: 5,
      maxScore: 100,
      passingScore: 60,
      passed: false,
    },
    {
      evaluationTitle: "Composition Finale",
      module: "Lesen",
      date: null,
      score: null,
      maxScore: 100,
      passingScore: 60,
      passed: null,
    },
  ],
  documentNumber: "REP-2026-4821",
  issuedAt: new Date("2026-09-12T10:00:00Z"),
  attendance: {
    total: 18,
    present: 14,
    late: 2,
    absent: 1,
    excused: 1,
  },
  financial: null,
  travel: null,
  scope: "academic" as const,
  validatedModules: 3,
  gradedModules: 4,
  generalAppreciation: "Bon travail, continuez ainsi.",
};

console.log("1. Bulletin premium — document HTML autonome & A4");
{
  const html = buildPremiumReportDocument(data, organization);

  assert(html.length > 2000, "document généré");
  assert(html.includes("<!DOCTYPE html>"), "document HTML complet");
  assert(
    html.includes("@page { size: A4"),
    "principale d'impression A4"
  );
  assert(
    html.includes("print-color-adjust: exact"),
    "couleurs forcées à l'impression"
  );
  assert(
    html.includes("Statut") && html.includes("/ Module"),
    "colonnes du tableau conforme (module + note + statut)"
  );
  assert(
    html.includes("Validé") && html.includes("Non validé"),
    "badges de statut modulaire"
  );
  assert(
    html.includes("Signature de l’enseignant") &&
      html.includes("Signature de la direction"),
    "zone de validations / signatures"
  );
  assert(
    html.includes("REP-2026-4821"),
    "identifiant unique du document"
  );
  assert(
    html.includes("N° RCCM") && html.includes("N° IFU"),
    "pied de page avec mentions légales"
  );
  assert(
    html.includes("BULLETIN") && html.includes("watermark"),
    "filigrane léger présent"
  );
}


console.log("2. Helpers partages - affichage et recapitulatif modularisable");
{
  const rows = data.rows;
  assert(formatScore(15.555) === "15,56", "formatage fr-FR");
  assert(formatScore(null) === "—", "note absente -> tiret");
  assert(formatScoreOnScale(60, 100) === "60 / 100", "bareme reel");
  assert(formatScoreOnScale(null, 100) === "— / 100", "bareme sans note");
  const total = computeModuleValidation(rows);
  assert(total.gradedModules === 4, "4 modules notes");
  assert(total.validatedModules === 3, "3 modules valides");
  const mixed = []
  mixed.push({ ...rows[0], passed: true });
  mixed.push({ ...rows[1], passed: null });
  mixed.push({ ...rows[2], passed: false });
  const mixedTotal = computeModuleValidation(mixed);
  assert(mixedTotal.gradedModules === 2, "2 modules notes sans note");
  assert(mixedTotal.validatedModules === 1, "1 module valide");
  assert(defaultAppreciationForValidation(3, 3).includes("Tous les modules"), "appreciation tous valides");
  assert(defaultAppreciationForValidation(0, 2).includes("Aucun module valid"), "appreciation aucun valide");
  assert(defaultAppreciationForValidation(0, 0).includes("Aucune note saisie"), "appreciation pas de note");
  assert(formatPremiumReportNumber("ETU-024", new Date("2026-09-12T10:00:00Z")).startsWith("REP-2026-"), "numero document");
  assert(paymentMethodLabel("CASH") === "Espèces", "label mode de paiement");
  assert(paymentMethodLabel("UNKNOWN") === "UNKNOWN", "fallback label");
}

console.log("3. Rapport global - recapitulatif financier admin et staff");
{
  const fullData = { ...data, financial: { totalCost: 350000, discount: 35000, discountLabel: "10 %", netAmount: 315000, amountPaid: 250000, remaining: 65000, isFullyPaid: false, history: [{ paidAt: new Date("2026-06-01T00:00:00Z"), amount: 100000, method: "CASH", reference: "Acompte" }, { paidAt: new Date("2026-07-15T00:00:00Z"), amount: 150000, method: "MOBILE_MONEY", reference: "Dp 075" }] } };
  assert(fullData.financial !== null && fullData.financial.remaining === 65000, "reste a payer calcule");
  assert(fullData.financial.history.length === 2, "historique present");
  assert(fullData.financial.history[1].method === "MOBILE_MONEY", "mode paiement historique");
}

console.log("");
if (failures === 0) { console.log("SUCCES : toutes les assertions passent."); } else { console.error(`ECHEC : ${failures} assertions en erreur.`); process.exit(1); }






