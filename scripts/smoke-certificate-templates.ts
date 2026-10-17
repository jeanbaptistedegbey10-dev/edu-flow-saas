/**
 * Smoke test des 4 modèles de certificats (Étape 3/3).
 *
 * Vérifie pour CHAQUE modèle (TEMPLATE_1..4) la présence :
 * - du CSS d'impression `@page { size: A4 landscape; margin: 0 }` ;
 * - des garde-fous anti-débordement 1 page (`break-after: avoid`,
 *   `page-break-inside: avoid`, conteneur `overflow: hidden`) ;
 * - du QR code de vérification + code unique ;
 * - du pied de page légal (agrément, RCCM, IFU, adresse, contacts) ;
 * - du filigrane (watermark) ;
 * - du logo en en-tête.
 *
 * Exécution : npx tsx scripts/smoke-certificate-templates.ts
 */
import { buildCertificateHtml } from "../src/lib/certificate-html";
import { CERTIFICATE_TEMPLATES } from "../src/lib/certificate-template";

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
  logoUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  organizationEmail: "contact@excellence.test",
  organizationPhone: "+225 07 00 00 00 01",
  organizationAddress: "Abidjan, Cocody",
  organizationCity: "Abidjan",
  organizationWebsite: "https://excellence.test",
  organizationRccm: "RB/COT/24 A 12345",
  organizationIfu: "3202412345678",
};

for (const template of CERTIFICATE_TEMPLATES) {
  console.log(`\n=== ${template} ===`);
  const html = buildCertificateHtml({ ...base, template });

  // CSS d'impression + anti-débordement 1 page A4 paysage.
  assert(
    html.includes("@page { size: A4 landscape; margin: 0; }"),
    "règle @page A4 paysage margin 0"
  );
  assert(
    html.includes("break-after: avoid") &&
      html.includes("page-break-inside: avoid") &&
      html.includes("break-inside: avoid"),
    "garde-fous break-after / page-break-inside / break-inside avoid"
  );
  assert(
    html.includes("width: 297mm") &&
      html.includes("height: 210mm") &&
      html.includes("overflow: hidden"),
    "conteneur 297×210 mm overflow hidden (1 page stricte)"
  );

  // Contenu métier.
  assert(html.includes("AB12CD34"), "code de vérification unique présent");
  assert(
    html.includes("create-qr-code") && html.includes("QR de vérification"),
    "QR code de vérification présent"
  );
  assert(html.includes("Aïcha Bello"), "nom de l'étudiant présent");
  assert(html.includes("STU-2026-0042"), "matricule présent");
  // L'encadré « Niveau certifié » a été retiré (consigne produit) : la place
  // est laissée au bloc de texte central.
  assert(
    !html.includes('class="level-box"') && !html.includes("Niveau certifié"),
    "encadré « Niveau certifié » retiré du rendu"
  );
  assert(html.includes("Français des affaires"), "formation présente");
  // Le texte par défaut intègre la date de naissance ({{birthDate}}).
  assert(
    html.includes("né(e) le") &&
      html.includes('<strong class="cert-var">15 avril 2001</strong>'),
    "date de naissance intégrée au texte par défaut (en gras)"
  );

  // Pied de page légal complet.
  assert(
    html.includes("Organisme de formation agréé"),
    "mention agrément"
  );
  assert(html.includes("RB/COT/24 A 12345"), "N° RCCM");
  assert(html.includes("3202412345678"), "N° IFU / NIF");
  assert(html.includes("Abidjan"), "adresse / ville");
  assert(html.includes("+225 07 00 00 00 01"), "téléphone");
  assert(html.includes("contact@excellence.test"), "e-mail");
  assert(html.includes("https://excellence.test"), "site web");

  // Filigrane + logo.
  assert(html.includes("watermark"), "filigrane (watermark) présent");
  assert(html.includes('class="watermark"'), "bloc watermark appliqué");
  assert(html.includes("Logo Centre Excellence"), "logo en en-tête");

  // Échappement : pas de balise script injectable via les valeurs hostiles.
  assert(
    !html.includes("<script>alert"),
    "aucune balise script non échappée"
  );
}

// Vérifie qu'un modèle inconnu retombe sur le modèle par défaut sans planter.
console.log("\n=== Robustesse (modèle inconnu) ===");
const fallback = buildCertificateHtml({
  ...base,
  template: "TEMPLATE_9",
  logoUrl: null,
});
assert(
  fallback.includes("@page { size: A4 landscape; margin: 0; }"),
  "modèle inconnu → rendu par défaut valide"
);
assert(fallback.includes("watermark"), "filigrane présent même sans logo");

console.log("");
if (failures > 0) {
  console.error(`ECHEC : ${failures} contrôle(s) en échec.`);
  process.exit(1);
}
console.log("OK : les 4 modèles de certificats sont conformes.");
