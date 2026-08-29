/**
 * Test de fumée (exécution réelle via `npx tsx`) :
 * 1. Génération des documents imprimables (facturette POS + bulletin de
 *    notes) et vérification des nouveaux styles logo + impression @page.
 * 2. Construction des points du graphique de performance étudiant
 *    (chronologie, modules validés, exclusion des sessions non notées).
 *
 * Exécution : npx tsx scripts/smoke-receipts-chart.ts
 */
import { buildSaleReceiptDocument } from "@/lib/receipt";
import { buildReportCardDocument } from "@/lib/report-card";
import { buildStudentPerformancePoints } from "@/components/students/student-performance-chart";

import type { OrganizationProfileDTO } from "@/actions/payments";

const organization: OrganizationProfileDTO = {
  id: "org-1",
  name: "Centre de Langues Évasion",
  email: "contact@evasion.bj",
  phone: "+229 97 00 00 00",
  address: "Rue 12.045, Cotonou",
  city: "Cotonou",
  website: "https://evasion.bj",
  logoUrl: null,
  rccm: "RB/COT/24 A 12345",
  ifu: "3202412345678",
};

let failures = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  OK  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
  }
}

// --------------------------------------
// 1. Facturette POS (reçu de caisse)
// --------------------------------------
console.log("1. Facturette POS — styles logo & impression");
const saleHtml = buildSaleReceiptDocument(
  {
    id: "sale-1",
    totalAmount: 30000,
    discount: 5000,
    netAmount: 25000,
    paymentMethod: "CASH",
    createdAt: new Date("2026-08-29T10:30:00.000Z"),
    clientName: "Client comptoir",
    clientDetail: null,
    cashierName: "Awa Sanni",
    items: [
      {
        name: "Manuel d'allemand A1",
        quantity: 2,
        unitPrice: 15000,
        subtotal: 30000,
      },
    ],
  },
  organization
);

assert(saleHtml.includes("max-height: 84px"), "logo : max-height 84px");
assert(saleHtml.includes("max-width: 260px"), "logo : max-width 260px");
assert(saleHtml.includes("object-fit: contain"), "logo : object-fit contain");
assert(
  /@media print[\s\S]*?@page \{ margin: 8mm; \}/.test(saleHtml),
  "impression : @page { margin: 8mm; } présent dans @media print"
);

// --------------------------------------
// 2. Bulletin de notes
// --------------------------------------
console.log("2. Bulletin de notes — styles logo & impression");
const reportHtml = buildReportCardDocument(
  {
    studentName: "Aïcha Kponou",
    studentCode: "ETU-2026-014",
    className: "Allemand A2 — soir",
    courseTitle: "Allemand général",
    rows: [
      {
        evaluationTitle: "Examen Continu N°1",
        evaluationDate: new Date("2026-06-15"),
        moduleName: "Lesen",
        score: 72,
        maxScore: 100,
        passingScore: 60,
      },
      {
        evaluationTitle: "Examen Continu N°2",
        evaluationDate: new Date("2026-07-20"),
        moduleName: "Hören",
        score: 55,
        maxScore: 100,
        passingScore: 60,
      },
    ],
    overallAverage: 63.5,
    validationRate: 50,
    gradedModuleCount: 2,
    validatedModuleCount: 1,
  },
  organization
);

assert(reportHtml.includes("max-height: 84px"), "logo : max-height 84px");
assert(reportHtml.includes("max-width: 260px"), "logo : max-width 260px");
assert(
  /@media print[\s\S]*?@page \{ margin: 8mm; \}/.test(reportHtml),
  "impression : @page { margin: 8mm; } présent dans @media print"
);

// --------------------------------------
// 3. Points du graphique de performance étudiant
// --------------------------------------
console.log("3. Graphique d'évolution — points chronologiques");
const points = buildStudentPerformancePoints([
  {
    id: "eval-1",
    title: "Examen Continu N°1",
    date: new Date("2026-06-15"),
    className: "Allemand A2",
    courseTitle: "Allemand général",
    averageOn100: 72,
    modules: [
      { moduleId: "m1", moduleName: "Lesen", maxScore: 100, passingScore: 60, score: 80 },
      { moduleId: "m2", moduleName: "Hören", maxScore: 100, passingScore: 60, score: 64 },
    ],
  },
  {
    id: "eval-2",
    title: "Examen Continu N°2",
    date: new Date("2026-07-20"),
    className: "Allemand A2",
    courseTitle: "Allemand général",
    averageOn100: 55,
    modules: [
      { moduleId: "m1", moduleName: "Lesen", maxScore: 100, passingScore: 60, score: 55 },
      { moduleId: "m2", moduleName: "Hören", maxScore: 100, passingScore: 60, score: null },
    ],
  },
  {
    id: "eval-3",
    title: "Session non notée",
    date: new Date("2026-08-10"),
    className: "Allemand A2",
    courseTitle: "Allemand général",
    averageOn100: null,
    modules: [
      { moduleId: "m1", moduleName: "Lesen", maxScore: 100, passingScore: 60, score: null },
    ],
  },
]);

assert(points.length === 2, "seules les sessions notées sont retenues (2)");
assert(
  points[0]?.label === "Examen Continu N°1" &&
    points[1]?.label === "Examen Continu N°2",
  "ordre chronologique préservé (N°1 puis N°2)"
);
assert(
  points[0]?.validatedModules === 2 && points[0]?.gradedModules === 2,
  "session 1 : 2/2 modules validés"
);
assert(
  points[1]?.validatedModules === 0 && points[1]?.gradedModules === 1,
  "session 2 : 0/1 module validé (module non noté exclu)"
);
assert(points.every((point) => point.moyenne >= 0 && point.moyenne <= 100), "moyennes normalisées sur 100");

console.log(
  failures === 0
    ? "\nTOUS LES TESTS PASSENT"
    : `\n${failures} TEST(S) EN ÉCHEC`
);
process.exit(failures === 0 ? 0 : 1);
