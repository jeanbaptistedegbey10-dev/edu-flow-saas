/**
 * Smoke test temporaire — attestation de suivi de cours (nouveau modèle).
 * Vérifie le texte par défaut, l'interpolation en gras des nouvelles
 * variables et le formatage des dates.
 */
import {
  buildDefaultAttestationMessage,
  buildInternalAttestationDocument,
  type InternalAttestationInput,
} from "../src/lib/report-card";
import type { OrganizationProfileDTO } from "../src/actions/payments";

let failures = 0;
function assert(condition: boolean, label: string): void {
  if (condition) console.log(`  OK  ${label}`);
  else {
    console.error(`  KO  ${label}`);
    failures += 1;
  }
}

const message = buildDefaultAttestationMessage();
assert(
  message.includes("Il est par la présente certifié que M./Mme {{studentName}}"),
  "nouveau texte par défaut présent"
);
assert(
  message.includes("{{birthDate}}") &&
    message.includes("{{city}}") &&
    message.includes("{{startDate}}") &&
    message.includes("{{expectedEndDate}}") &&
    message.includes("{{examDate}}") &&
    message.includes("{{organizationName}}"),
  "nouvelles variables présentes"
);
assert(
  message.includes(
    "Cette attestation est délivrée à la demande de l'intéressé(e)"
  ),
  "phrase de clôture intégrée au modèle"
);

const organization: OrganizationProfileDTO = {
  id: "org-1",
  name: "Digital Infotech",
  city: "Abomey-Calavi",
  email: "contact@digital.test",
  phone: "+229 00 00 00 00",
  address: "Quartier X",
  website: null,
  rccm: null,
  ifu: null,
  logoUrl: null,
} as OrganizationProfileDTO;

const data: InternalAttestationInput = {
  studentName: "Awa Traoré",
  studentCode: "STU-2026-0001",
  className: "Allemand A1",
  courseTitle: "Allemand A1",
  overallAverage: null,
  validationRate: null,
  birthDate: "2001-04-15",
  city: "Cocody Angré",
  startDate: "2025-10-06",
  expectedEndDate: "2026-06-30",
  examDate: "2026-07-15",
};

const html = buildInternalAttestationDocument(data, organization);

assert(
  html.includes("<strong>Awa Traoré</strong>"),
  "{{studentName}} en gras"
);
assert(html.includes("<strong>15 avril 2001</strong>"), "{{birthDate}} formatée + gras");
assert(html.includes("<strong>Cocody Angré</strong>"), "{{city}} en gras");
assert(html.includes("<strong>06 octobre 2025</strong>"), "{{startDate}} formatée + gras");
assert(
  html.includes("<strong>30 juin 2026</strong>"),
  "{{expectedEndDate}} formatée + gras"
);
assert(html.includes("<strong>15 juillet 2026</strong>"), "{{examDate}} formatée + gras");
assert(html.includes("<strong>Allemand A1</strong>"), "{{courseName}} en gras");
assert(html.includes("<strong>Digital Infotech</strong>"), "{{organizationName}} en gras");
assert(
  !html.includes("Classe / Cohorte"),
  "ligne « Classe / Cohorte » retirée de l'en-tête de l'attestation"
);
assert(
  html.includes(">Formation</th>"),
  "ligne « Formation » conservée dans l'en-tête"
);
assert(
  !html.includes("servir et valoir ce que de droit, à la demande de celui-ci"),
  "ancien paragraphe de clôture dupliqué retiré"
);
assert(
  (html.match(/servir et valoir ce que de droit/g) ?? []).length === 1,
  "phrase de clôture présente une seule fois"
);

console.log("");
if (failures > 0) {
  console.error(`ECHEC : ${failures} controle(s) en echec.`);
  process.exit(1);
}
console.log("OK : attestation de suivi de cours conforme.");
