/**
 * Audit statique — injections HTML (XSS) dans les générateurs de documents.
 *
 * Chaque template HTML doit échapper TOUTE valeur issue de la base ou du
 * client avant interpolation. Ce script détecte les interpolations `${...}`
 * faites directement dans un littéral HTML sans appel à un utilitaire
 * d'échappement (`escapeHtml`, `escapeHtmlAttribute`, `encodeURIComponent`…).
 *
 * Lecture seule (usage : node scripts/audit-xss.mjs).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src/lib";
const TARGET_FILES = [
  "certificate-html.ts",
  "certificate-pdf.tsx",
  "receipt.ts",
  "report-card.ts",
  "student-statement.ts",
  "attendance-report.ts",
  "attendance-sheet.ts",
  "exam-report.ts",
  "exam-report-document.ts",
  "premium-report.ts",
  "premium-report-document.ts",
  "user-manual-document.ts",
  "full-class-export.ts",
  "export.ts",
];

/** Utilitaires considérés comme « échappement correct ». */
const ESCAPERS = /escapeHtml|safeEqual|encodeURIComponent|htmlEscape|escapeAttr/i;

function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

let totalIssues = 0;

for (const name of TARGET_FILES) {
  const path = join(ROOT, name);
  if (!exists(path)) {
    console.log(`\n(ABSENT) ${path}`);
    continue;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const hasEscaper = lines.some((l) => ESCAPERS.test(l));
  const findings = [];

  lines.forEach((line, i) => {
    // Ignore les lignes purement CSS/constantes et les littéraux vides.
    if (!line.includes("${")) return;
    // Une interpolation est sûre si la ligne entière passe par un échappeur.
    if (ESCAPERS.test(line)) return;
    // Ignore les valeurs statiques clairement sûres (types TS non textuels).
    if (/\$\{(score|toFixed|new Date|Number|Math\.)/.test(line)) return;
    // Ignore les interpolations purement techniques déjà filtrées en amont.
    if (/\$\{(page|index|totalPages|currentPage)\b/.test(line)) return;

    findings.push({ line: i + 1, code: line.trim() });
  });

  console.log(
    `\n${name}  —  échappeur ${hasEscaper ? "DÉFINI" : "ABSENT ⚠️"}  —  ${findings.length} interpolation(s) non échappée(s)`
  );

  for (const f of findings) {
    totalIssues += 1;
    console.log(`   L${f.line}: ${f.code.slice(0, 150)}`);
  }
}

console.log(`\nTotal interpolations HTML non échappées : ${totalIssues}`);
