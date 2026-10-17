/**
 * Test de fumée (exécution réelle via `npx tsx`) :
 * 1. Génération des documents imprimables (facturette POS + bulletin de
 *    notes) et vérification de l'en-tête flex 2 colonnes (baseline
 *    adresse / numéro), du logo large et de l'impression @page.
 * 2. Construction des points du graphique de performance étudiant
 *    (chronologie, modules validés, exclusion des sessions non notées).
 *
 * Exécution : npx tsx scripts/smoke-receipts-chart.ts
 */
import { buildSaleReceiptDocument } from "@/lib/receipt";
import { buildReportCardDocument } from "@/lib/report-card";
import { buildStudentPerformancePoints } from "@/components/students/student-performance-chart";

import type { OrganizationProfileDTO } from "@/actions/payments";
import type { SaleReceiptInput } from "@/lib/receipt";
import type { ReportCardInput } from "@/lib/report-card";

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
  certificateTemplate: "TEMPLATE_1",
  certificateTextTemplate: null,
};

// Variante avec logo importé (data URL PNG 1×1) : permet de vérifier le
// rendu du logo (80px de haut max, conteneur 260px) dans l'en-tête.
const organizationWithLogo: OrganizationProfileDTO = {
  ...organization,
  logoUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
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
console.log(
  "1. Facturette POS — en-tête flex 2 colonnes, logo large & impression"
);
const saleInput: SaleReceiptInput = {
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
};
// Sans logo : monogramme de secours. Avec logo : rendu large du logo.
const saleHtml = buildSaleReceiptDocument(saleInput, organization);
const saleHtmlLogo = buildSaleReceiptDocument(saleInput, organizationWithLogo);

// Conteneur : structure flex stricte — colonnes 55 % / 40 % réparties en
// space-between, étirées sur la même hauteur.
assert(
  saleHtml.includes(
    "display: flex; justify-content: space-between; align-items: stretch;"
  ),
  "en-tête : structure flex space-between, colonnes étirées"
);
assert(
  saleHtml.includes("width: 55%;") && saleHtml.includes("width: 40%;"),
  "en-tête : colonnes 55 % / 40 %"
);
assert(
  saleHtml.includes("margin-bottom: 16px"),
  "en-tête : marge basse de 16px"
);
// Bloc gauche : empilement logo → nom, adresse ancrée tout en bas.
assert(
  saleHtml.includes(
    "display: flex; flex-direction: column; justify-content: space-between; width: 55%;"
  ),
  "bloc gauche : colonne flex space-between (adresse ancrée en bas)"
);
assert(
  saleHtml.includes("font-size: 15px") &&
    saleHtml.includes("text-transform: uppercase"),
  "nom du centre : 15px, capitales"
);
assert(
  saleHtml.includes("font-size: 11px; color: #6b7280; margin-top: 6px;"),
  "adresse : 11px, gris #6b7280, ancrée tout en bas"
);
// Bloc droite : contacts alignés à droite, titre + numéro ancrés tout en bas.
assert(
  saleHtml.includes(
    "justify-content: space-between; align-items: flex-end; text-align: right; width: 40%;"
  ),
  "bloc droite : colonne flex space-between alignée à droite"
);
assert(
  saleHtml.includes("border-bottom: 2px solid #111827"),
  "filet plein 2px clôturant l'en-tête"
);
assert(
  saleHtml.includes("font-size: 14px; font-weight: 800"),
  "titre du document : 14px, graisse 800"
);
assert(
  saleHtml.includes("font-size: 11px; color: #6b7280"),
  "numéro du document : 11px, gris #6b7280"
);
// Logo sans image : monogramme de secours.
assert(
  saleHtml.includes("width: 60px; height: 60px;"),
  "logo : monogramme de secours 60x60 conservé"
);
// Logo avec image : conteneur pleine largeur plafonné à 260px, image calée
// à gauche (recadrage fait à la source).
assert(
  saleHtmlLogo.includes("margin-bottom: 8px; width: 100%; max-width: 260px;") &&
    saleHtmlLogo.includes(
      "display: block; width: auto; max-width: 100%; max-height: 80px;"
    ) &&
    saleHtmlLogo.includes("object-position: left center"),
  "logo image : conteneur 260px, image bloc calée à gauche, 80px de haut max"
);
assert(
  /@media print[\s\S]*?@page \{ margin: 8mm; \}/.test(saleHtml),
  "impression : @page { margin: 8mm; } présent dans @media print"
);

// --------------------------------------
// 2. Bulletin de notes
// --------------------------------------
console.log(
  "2. Bulletin de notes — en-tête flex 2 colonnes, logo large & impression"
);
const reportInput: ReportCardInput = {
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
};
const reportHtml = buildReportCardDocument(reportInput, organizationWithLogo);

assert(
  reportHtml.includes(
    "display: flex; justify-content: space-between; align-items: stretch;"
  ),
  "en-tête : structure flex space-between, colonnes étirées"
);
assert(
  reportHtml.includes("width: 55%;") && reportHtml.includes("width: 40%;"),
  "en-tête : colonnes 55 % / 40 %"
);
assert(
  reportHtml.includes("margin-bottom: 8px; width: 100%; max-width: 260px;") &&
    reportHtml.includes(
      "display: block; width: auto; max-width: 100%; max-height: 80px;"
    ) &&
    reportHtml.includes("object-position: left center"),
  "logo image : conteneur 260px, image bloc calée à gauche, 80px de haut max"
);
assert(
  reportHtml.includes(
    "justify-content: space-between; align-items: flex-end; text-align: right; width: 40%;"
  ),
  "bloc droite : colonne flex space-between alignée à droite"
);
assert(
  reportHtml.includes("border-bottom: 2px solid #111827"),
  "filet plein 2px clôturant l'en-tête"
);
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
