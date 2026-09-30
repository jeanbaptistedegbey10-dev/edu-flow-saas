/**
 * Test de régression — XSS dans le template HTML du certificat.
 *
 * Vérifie que TOUTE valeur issue de la base ou du client est échappée
 * avant interpolation dans `buildCertificateHtml`, dont le rendu est
 * injecté via `iframe srcDoc` (même origine que le dashboard).
 *
 * Exécution : npx tsx scripts/check-certificate-xss.ts
 */
import { buildCertificateHtml } from "../src/lib/certificate-html";

const EVIL_TAG = '</style><script>alert(1)</script>';
const EVIL_ATTR = '" onload="alert(2)';

const html = buildCertificateHtml({
  studentName: EVIL_TAG,
  studentCode: EVIL_ATTR,
  level: EVIL_ATTR,
  score: 88.85,
  issueDate: new Date("2026-01-15"),
  verificationCode: EVIL_TAG,
  verificationUrl: 'https://x.test/verify?a="1"',
  organizationName: EVIL_TAG,
  courseTitle: EVIL_TAG,
});

const failures: string[] = [];

if (html.includes("<script>alert(1)")) {
  failures.push("Balise <script> injectee dans le HTML rendu.");
}
if (html.includes('onload="alert(2)')) {
  failures.push("Attribut onload injecte (injection d'attribut).");
}
if (html.includes('data="1"')) {
  failures.push("Guillemet non echappe dans l'URL du QR code.");
}

// Chaque valeur doit apparaitre sous forme echappee dans le rendu.
const checks: Array<[string, RegExp]> = [
  ["studentName", /<h2 class="student-name">([^<]*)<\/h2>/],
  ["organizationName", /<div class="org-name">([^<]*)</],
  ["verificationCode", /<div class="verify-code">([^<]*)</],
  ["level", /<p class="level-value">([^<]*)</],
  ["studentCode", /<p class="student-code">Matricule : ([^<]*)</],
  ["courseTitle", /<strong>([^<]*)<\/strong>/],
];

console.log("=== Rendu des valeurs hostiles ===");
for (const [label, pattern] of checks) {
  const match = html.match(pattern);
  const value = match ? match[1] : "(introuvable)";

  console.log(`${label.padEnd(18)} -> ${value}`);

  if (!match) {
    failures.push(`${label} : absent du rendu.`);
    continue;
  }

  if (value.includes("<") || value.includes('"')) {
    failures.push(`${label} : caractere special non echappe.`);
  }
}

console.log("");
if (failures.length > 0) {
  console.error("ECHEC :");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("OK : aucune injection HTML possible dans le certificat.");
