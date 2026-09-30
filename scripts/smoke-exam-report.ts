/**
 * Test de fumée (exécution réelle via `npx tsx`) :
 * Bulletin D'EXAMEN restreint à une session d'évaluation précise.
 *
 * 1. `formatExamReportNumber` → format `BEX-<ANNEE>-<XXXX>`.
 * 2. `buildExamReportDocument` → contient l'intitulé de l'examen, la classe,
 *    les notes sur barème et AUCUNE trace des autres examens ni de données
 *    financières / procédure de voyage.
 * 3. Échappement HTML des caractères spéciaux (<, >, &, quotes).
 *
 * Exécution : npx tsx scripts/smoke-exam-report.ts
 */
import { buildExamReportDocument } from "@/lib/exam-report-document";
import { formatExamReportNumber, type ExamReportData } from "@/lib/exam-report";
import type { PremiumReportOrganization } from "@/lib/premium-report";
import {
  MAX_APPRECIATION_LENGTH,
  defaultAppreciationForValidation,
  examAppreciationScope,
  isValidAppreciationScope,
  normalizeAppreciationText,
  recapAppreciationScope,
  resolveAppreciation,
} from "@/lib/premium-report";
import { PREMIUM_REPORT_PRINT_CSS } from "@/components/reports/premium-report-sheet";

const organization: PremiumReportOrganization = {
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
// 1. Numérotation du document
// --------------------------------------
console.log("1. Numéro de document `BEX-<ANNEE>-<XXXX>`");
const number2026 = formatExamReportNumber(new Date("2026-03-05T10:00:00Z"));
assert(/^BEX-2026-\d{4}$/.test(number2026), `format BEX : ${number2026}`);
const number2025 = formatExamReportNumber(new Date("2025-11-30T10:00:00Z"));
assert(/^BEX-2025-\d{4}$/.test(number2025), `format BEX : ${number2025}`);

// --------------------------------------
// 2. Document HTML restreint à l'examen
// --------------------------------------
console.log("2. Document HTML — restreint à CET examen uniquement");
const data: ExamReportData = {
  studentFirstName: "Awa",
  studentLastName: "Traoré & Fils <Test>",
  studentCode: "ETU-2026-0042",
  evaluationTitle: "Examen Continu N°1",
  evaluationDate: new Date("2026-03-05T00:00:00Z"),
  className: "Allemand A1 — Matin",
  courseTitle: "Allemand débutant",
  courseCode: "DEU-A1",
  teacherName: "Marc Dupont",
  periodLabel: "S1 2025/2026",
  rows: [
    {
      module: "Lesen",
      score: 72,
      maxScore: 100,
      passingScore: 60,
      passed: true,
    },
    {
      module: "Hören",
      score: 45,
      maxScore: 100,
      passingScore: 60,
      passed: false,
    },
    {
      module: "Sprechen",
      score: null,
      maxScore: 50,
      passingScore: 30,
      passed: null,
    },
  ],
  gradedModules: 2,
  validatedModules: 1,
  appreciation:
    "1 module validé sur 2 évalués. Les modules non validés doivent être repris.",
  // Suivi des présences de la classe évaluée (18 émargements : 14 présents,
  // 2 retards, 1 absence, 1 absence excusée → 16/18 = 89 % de présence).
  attendance: {
    totalSessions: 18,
    presentSessions: 16,
    absentSessions: 1,
    lateSessions: 2,
    excusedSessions: 1,
    attendanceRate: 89,
  },
  documentNumber: "BEX-2026-1234",
  issuedAt: new Date("2026-03-06T09:00:00Z"),
};

const html = buildExamReportDocument(data, organization);

// Contenu attendu : intitulé de l'examen, classe, période, notes sur barème.
assert(html.includes("Examen Continu N°1"), "intitulé de l'examen présent");
assert(html.includes("Allemand A1 — Matin"), "classe présente");
assert(html.includes("S1 2025/2026"), "période présente");
assert(html.includes("72 / 100"), "note sur barème (72 / 100)");
assert(html.includes("45 / 100"), "note sur barème (45 / 100)");
assert(html.includes("BEX-2026-1234"), "numéro de document présent");
assert(html.includes("Modules validés"), "récapitulatif modules validés");
assert(
  html.includes("Bulletin restreint à l'examen"),
  "mention de la portée restreinte"
);

// Portée : AUCUN autre examen, AUCUNE donnée financière / voyage.
assert(!html.includes("Examen Final"), "aucun autre examen (Examen Final)");
assert(!html.includes("Lesen" + " — " + "AutreExamen"), "pas d'empilement");
assert(
  !html.includes("Récapitulatif financier"),
  "aucune section financière"
);
assert(!html.includes("Procédure de voyage"), "aucune section voyage");
assert(html.includes("EXAMEN"), "filigrane EXAMEN présent");
assert(html.includes("@page { size: A4 portrait"), "règle @page A4 présente");
assert(html.includes("Signature de l\u2019enseignant"), "zone signature présente");
assert(html.includes("Appréciation de cet examen"), "appréciation présente");

// Assiduité / Présences : bloc présent, metrics lisibles et placé AVANT
// l'appréciation.
assert(
  html.includes("Assiduité / Présences"),
  "section assiduité / présences présente"
);
assert(html.includes("Séances présentes"), "compteur « séances présentes »");
assert(html.includes("16 / 18"), "séances présentes / total des séances");
assert(html.includes("Taux de présence"), "compteur « taux de présence »");
assert(html.includes("89 %"), "taux de présence en pourcentage");
assert(html.includes("Absences"), "compteur « absences »");
assert(
  html.indexOf("Assiduité / Présences") <
    html.indexOf("Appréciation de cet examen"),
  "bloc assiduité positionné AU-DESSUS de la zone d'appréciation"
);

// Sans données de présence : la section est omise (pas de bloc vide).
const htmlSansPresence = buildExamReportDocument(
  { ...data, attendance: null },
  organization
);
assert(
  !htmlSansPresence.includes("Assiduité / Présences"),
  "section assiduité omise si aucune donnée"
);
assert(
  htmlSansPresence.includes("Appréciation de cet examen"),
  "appréciation conservée sans section assiduité"
);

// --------------------------------------
// 3. Échappement HTML
// --------------------------------------
console.log("3. Échappement HTML des caractères spéciaux");
assert(
  html.includes("Awa Traoré &amp; Fils &lt;Test&gt;"),
  "nom échappé (& < >)"
);
assert(!html.includes("<Test>"), "aucun chevron non échappé du nom");

// --------------------------------------
// 4. CSS d'impression scoped du bulletin
// --------------------------------------
console.log("4. CSS d'impression — page A4 pleine, hors-bulletin masqué");
assert(
  PREMIUM_REPORT_PRINT_CSS.includes("@page { size: A4 portrait"),
  "format A4 portrait déclaré"
);
assert(
  PREMIUM_REPORT_PRINT_CSS.includes("@media print"),
  "règles encapsulées dans @media print"
);
// Pas de hauteur fixe / pas de débordement caché : c'était LA cause du
// bulletin rogné dans l'aperçu du navigateur.
assert(
  !/height:\s*275mm/.test(PREMIUM_REPORT_PRINT_CSS),
  "aucune hauteur fixe de 275 mm sur #print-area"
);
assert(
  !/overflow:\s*hidden\s*!important/.test(PREMIUM_REPORT_PRINT_CSS),
  "aucun overflow: hidden !important (contenu non rogné)"
);
// Chrome applicatif réellement retiré du flux.
assert(
  PREMIUM_REPORT_PRINT_CSS.includes("[data-slot='sidebar-wrapper']"),
  "barre latérale ciblée"
);
assert(
  PREMIUM_REPORT_PRINT_CSS.includes("[data-slot='dialog-header']"),
  "en-tête de modale (boutons) ciblé"
);
assert(
  PREMIUM_REPORT_PRINT_CSS.includes("display: none !important"),
  "chrome masqué via display: none !important"
);
// Le conteneur du bulletin occupe tout le document.
assert(
  /body\.report-printing #print-area \{[\s\S]*?width: 100% !important/.test(
    PREMIUM_REPORT_PRINT_CSS
  ),
  "#print-area en width: 100% !important"
);
assert(
  /body\.report-printing #print-area \{[\s\S]*?overflow: visible !important/.test(
    PREMIUM_REPORT_PRINT_CSS
  ),
  "#print-area en overflow: visible !important"
);
assert(
  /body\.report-printing #print-area \{[\s\S]*?margin: 0 !important/.test(
    PREMIUM_REPORT_PRINT_CSS
  ),
  "#print-area en margin: 0 !important"
);
assert(
  PREMIUM_REPORT_PRINT_CSS.includes("print-color-adjust: exact !important"),
  "couleurs du bulletin conservées à l'impression"
);
assert(
  PREMIUM_REPORT_PRINT_CSS.includes("[data-print-hide]"),
  "éléments marqués data-print-hide exclus (ex. éditeur d'appréciation)"
);

// --------------------------------------
// 5. Appréciation : portée, normalisation et repli automatique
// --------------------------------------
console.log("5. Appréciation — portée, normalisation, repli sur l'automatique");
assert(
  examAppreciationScope("eval-1") === "exam:eval-1",
  "portée du bulletin d'examen"
);
assert(
  recapAppreciationScope("class-1") === "recap:class-1",
  "portée du bulletin récapitulatif"
);
assert(
  recapAppreciationScope(null) === "recap:global",
  "portée récapitulatif hors classe"
);
assert(
  isValidAppreciationScope("exam:abc123") &&
    isValidAppreciationScope("recap:abc123"),
  "portées valides acceptées"
);
assert(
  !isValidAppreciationScope("exam:../../etc/passwd") &&
    !isValidAppreciationScope("autre:abc") &&
    !isValidAppreciationScope("exam:"),
  "portées malformées / injections refusées"
);
assert(
  normalizeAppreciationText("  Bon travail !  \r\n") === "Bon travail !",
  "normalisation : espaces de bordure et CRLF"
);
assert(normalizeAppreciationText("   ") === "", "texte vide = retour à l'auto");
assert(
  normalizeAppreciationText("a".repeat(MAX_APPRECIATION_LENGTH + 500))
    .length === MAX_APPRECIATION_LENGTH,
  "longueur plafonnée"
);
const auto = defaultAppreciationForValidation(1, 2);
assert(
  resolveAppreciation(auto, null) === auto,
  "sans texte personnalisé → texte automatique conservé"
);
assert(
  resolveAppreciation(auto, "   ") === auto,
  "texte personnalisé vide → texte automatique conservé"
);
assert(
  resolveAppreciation(auto, "Excellent élève.") === "Excellent élève.",
  "texte personnalisé prioritaire"
);

console.log(
  failures === 0
    ? "\nSMOKE OK — bulletin d'examen conforme."
    : `\nSMOKE FAILED — ${failures} échec(s).`
);
process.exit(failures === 0 ? 0 : 1);
