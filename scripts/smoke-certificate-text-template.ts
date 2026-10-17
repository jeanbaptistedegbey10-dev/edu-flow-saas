/**
 * Test de fumée — personnalisation dynamique du texte des certificats.
 *
 * Vérifie que `buildCertificateHtml` interprète correctement le gabarit
 * `certificateTextTemplate` fourni par l'organisation :
 * - substitution des variables dynamiques `{{studentName}}`, `{{matricule}}`,
 *   `{{courseName}}`, `{{level}}`, `{{date}}`, `{{organizationName}}`,
 *   `{{verificationCode}}`, `{{score}}` ;
 * - repli sur le texte standard quand le gabarit est absent/vide ;
 * - échappement anti-XSS du gabarit ET des valeurs injectées ;
 * - conservation des garde-fous 1 page A4 paysage sur les 4 modèles.
 *
 * Exécution : npx tsx scripts/smoke-certificate-text-template.ts
 */
import { buildCertificateHtml } from "../src/lib/certificate-html";
import { CERTIFICATE_TEMPLATES } from "../src/lib/certificate-template";
import { interpolateCertificateTemplate, prepareCertificateData } from "../src/lib/certificate-shared";

let failures = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  OK  ${label}`);
  } else {
    console.error(`  KO  ${label}`);
    failures += 1;
  }
}

const base = {
  studentName: "Aïcha Bello",
  studentCode: "STU-2026-0042",
  birthDate: "2001-04-15",
  level: "B2 — Avancé",
  score: 88.5,
  issueDate: new Date("2026-06-15"),
  verificationCode: "AB12CD34",
  verificationUrl: "https://eduflow.test/verify/AB12CD34",
  organizationName: "Centre Excellence",
  courseTitle: "Français des affaires",
  organizationRccm: "RB/COT/24 A 12345",
  organizationIfu: "3202412345678",
};

const template = [
  "Nous, {{organizationName}}, certifions que",
  "{{studentName}} (matricule {{matricule}}, né(e) le {{birthDate}}) a validé la formation",
  "{{courseName}} et atteint le niveau {{level}}.",
  "Délivré le {{date}} — code de vérification {{verificationCode}}.",
  "Mention obtenue : {{score}}.",
].join("\n");

// ---------------------------------------------------------------------------
// 1. Interpolation unitaire
// ---------------------------------------------------------------------------
console.log("\n=== Interpolation des variables ===");
const sd = prepareCertificateData({ ...base, certificateTextTemplate: template });
const interpolated = interpolateCertificateTemplate(template, sd);
assert(interpolated.includes("Centre Excellence"), "{{organizationName}} substitué");
assert(interpolated.includes("Aïcha Bello"), "{{studentName}} substitué");
assert(interpolated.includes("15 avril 2001"), "{{birthDate}} substituée");
assert(interpolated.includes("STU-2026-0042"), "{{matricule}} substitué");
assert(interpolated.includes("Français des affaires"), "{{courseName}} substitué");
assert(interpolated.includes("B2 — Avancé"), "{{level}} substitué");
assert(interpolated.includes("AB12CD34"), "{{verificationCode}} substitué");
assert(interpolated.includes("15 juin 2026"), "{{date}} substitué");
assert(interpolated.includes("88.5 %"), "{{score}} substitué");
assert(interpolated.includes("<br />"), "retours à la ligne convertis en <br />");

// Mise en gras automatique des valeurs injectées.
assert(
  interpolated.includes('<strong class="cert-var">Aïcha Bello</strong>'),
  "{{studentName}} entouré d'une balise <strong> (gras)"
);
assert(
  interpolated.includes('<strong class="cert-var">15 avril 2001</strong>'),
  "{{birthDate}} entouré d'une balise <strong> (gras)"
);
assert(
  interpolated.includes('<strong class="cert-var">Français des affaires</strong>'),
  "{{courseName}} entouré d'une balise <strong> (gras)"
);
assert(
  interpolated.includes('<strong class="cert-var">15 juin 2026</strong>'),
  "{{date}} entouré d'une balise <strong> (gras)"
);
assert(
  !interpolated.includes('<strong class="cert-var"></strong>'),
  "aucune balise <strong> vide produite"
);

// Une variable sans valeur (aucun cours rattaché) reste simplement vide.
const sdNoCourse = prepareCertificateData({
  ...base,
  courseTitle: null,
  certificateTextTemplate: "Formation suivie : {{courseName}}.",
});
assert(
  interpolateCertificateTemplate("Formation suivie : {{courseName}}.", sdNoCourse) ===
    "Formation suivie : .",
  "variable vide non enveloppée de <strong>"
);

// ---------------------------------------------------------------------------
// 2. Rendu complet sur les 4 modèles
// ---------------------------------------------------------------------------
console.log("\n=== Rendu du gabarit sur les 4 modèles ===");
for (const tpl of CERTIFICATE_TEMPLATES) {
  const html = buildCertificateHtml({ ...base, template: tpl, certificateTextTemplate: template });
  assert(
    html.includes("cert-body--custom"),
    `${tpl} : bloc central personnalisé appliqué`
  );
  assert(
    html.includes("Aïcha Bello") && html.includes("STU-2026-0042"),
    `${tpl} : nom + matricule présents dans le corps`
  );
  assert(
    html.includes("@page { size: A4 landscape; margin: 0; }"),
    `${tpl} : contrainte 1 page A4 paysage conservée`
  );
  assert(
    html.includes(".cert-var"),
    `${tpl} : CSS de mise en gras des variables présent`
  );
  assert(
    html.includes('<strong class="cert-var">Aïcha Bello</strong>'),
    `${tpl} : valeur de l'étudiant entourée d'un <strong>`
  );
  // Le texte standard ne doit plus apparaître en mode personnalisé.
  assert(
    !html.includes("Il est certifié par la présente que l'étudiant(e)"),
    `${tpl} : texte standard remplacé par le gabarit`
  );
}

// ---------------------------------------------------------------------------
// 3. Repli sur le texte standard (gabarit vide / null)
// ---------------------------------------------------------------------------
console.log("\n=== Repli sur le texte standard ===");
for (const value of [null, "", "   "]) {
  const html = buildCertificateHtml({ ...base, certificateTextTemplate: value });
  assert(
    html.includes("Il est certifié par la présente que l'étudiant(e)") &&
      !html.includes("cert-body--custom"),
    `gabarit ${JSON.stringify(value)} → texte standard`
  );
}

// Le texte standard entoure bien chacune de ses variables d'un <strong>.
const defaultBodyHtml = buildCertificateHtml({
  ...base,
  certificateTextTemplate: null,
});
assert(
  defaultBodyHtml.includes("né(e) le") &&
    defaultBodyHtml.includes(
      '<strong class="cert-var">15 avril 2001</strong>'
    ),
  "texte standard : date de naissance intégrée et en <strong>"
);
assert(
  defaultBodyHtml.includes("La présente attestation me est délivrée"),
  "texte standard : formulation « me est délivrée » appliquée"
);
assert(
  defaultBodyHtml.includes('<strong class="cert-var">Aïcha Bello</strong>') &&
    defaultBodyHtml.includes(
      '<strong class="cert-var">STU-2026-0042</strong>'
    ) &&
    defaultBodyHtml.includes(
      '<strong class="cert-var">Français des affaires</strong>'
    ) &&
    defaultBodyHtml.includes('<strong class="cert-var">15 juin 2026</strong>'),
  "texte standard : variables étudiant / matricule / formation / date en <strong>"
);

// ---------------------------------------------------------------------------
// 4. Échappement anti-XSS du gabarit saisi par l'administration
// ---------------------------------------------------------------------------
console.log("\n=== Échappement anti-XSS du gabarit ===");
const evilTemplate = '</style><script>alert(1)</script> {{studentName}}';
const evilHtml = buildCertificateHtml({
  ...base,
  certificateTextTemplate: evilTemplate,
});
assert(
  !evilHtml.includes("<script>alert(1)</script>"),
  "script injecté via le gabarit neutralisé"
);
assert(
  evilHtml.includes("&lt;script&gt;") || !evilHtml.includes("<script>"),
  "balise script du gabarit échappée"
);

console.log("");
if (failures > 0) {
  console.error(`ECHEC : ${failures} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("OK : la personnalisation dynamique du texte est conforme.");
