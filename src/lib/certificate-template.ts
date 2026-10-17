// --------------------------------------
// Modèles graphiques de certificats (module PUR)
// --------------------------------------
//
// Définit les 4 mises en page proposées pour les certificats / attestations
// de compétence. Module volontairement autonome : ni `server-only`, ni
// Prisma, ni React — il est importable aussi bien par les Server Actions
// (validation + persistance du choix de l'organisation) que par les
// composants clients (formulaire d'organisation) et par le moteur de rendu
// HTML (`certificate-html.ts`).
//
// Les valeurs (`"TEMPLATE_1"` … `"TEMPLATE_4"`) sont STRICTEMENT alignées sur
// l'enum Prisma `CertificateTemplate` : une même chaîne circule du formulaire
// à la colonne `Organization.certificateTemplate` puis au rendu, sans
// conversion hasardeuse.

/** Clé d'un modèle de certificat (également valeur de l'enum Prisma). */
export type CertificateTemplateKey =
  | "TEMPLATE_1"
  | "TEMPLATE_2"
  | "TEMPLATE_3"
  | "TEMPLATE_4";

/** Modèle appliqué par défaut à toute nouvelle organisation. */
export const DEFAULT_CERTIFICATE_TEMPLATE: CertificateTemplateKey = "TEMPLATE_1";

/** Liste ordonnée des modèles disponibles (alimente le sélecteur d'organisation). */
export const CERTIFICATE_TEMPLATES: readonly CertificateTemplateKey[] = [
  "TEMPLATE_1",
  "TEMPLATE_2",
  "TEMPLATE_3",
  "TEMPLATE_4",
];

/** Libellés lisibles affichés dans les paramètres de l'organisation. */
export const CERTIFICATE_TEMPLATE_LABELS: Record<
  CertificateTemplateKey,
  string
> = {
  TEMPLATE_1: "Modèle 1 — Bleu & Or (moderne)",
  TEMPLATE_2: "Modèle 2 — Institutionnel (classique)",
  TEMPLATE_3: "Modèle 3 — Ruban rouge (distingué)",
  TEMPLATE_4: "Modèle 4 — Vagues violettes (contemporain)",
};

/** Courte description du rendu, affichée sous le sélecteur. */
export const CERTIFICATE_TEMPLATE_DESCRIPTIONS: Record<
  CertificateTemplateKey,
  string
> = {
  TEMPLATE_1:
    "Cadre géométrique moderne avec double liseré or et marine, sceau circulaire.",
  TEMPLATE_2:
    "Style institutionnel épuré : logo en haut, QR code centré en bas, blocs de signature Direction / Pédagogie.",
  TEMPLATE_3:
    "Bordures sobres, ruban vertical rouge et badge doré sur le côté droit.",
  TEMPLATE_4:
    "Marge décorative en vagues violettes et dorées, mise en page contemporaine.",
};

/**
 * Réduit une valeur arbitraire (issue d'un `FormData`, d'une base historique
 * ou d'une ancienne organisation) à une clé de modèle valide. Retombe sur
 * `DEFAULT_CERTIFICATE_TEMPLATE` si la valeur est absente ou inconnue :
 * le rendu ne doit jamais planter pour un modèle non reconnu.
 */
export function normalizeCertificateTemplate(
  value: unknown
): CertificateTemplateKey {
  if (typeof value !== "string") return DEFAULT_CERTIFICATE_TEMPLATE;
  const upper = value.trim().toUpperCase();
  return (CERTIFICATE_TEMPLATES as readonly string[]).includes(upper)
    ? (upper as CertificateTemplateKey)
    : DEFAULT_CERTIFICATE_TEMPLATE;
}

/** Garde de type resserrée : `true` si la chaîne est une clé de modèle connue. */
export function isCertificateTemplateKey(
  value: unknown
): value is CertificateTemplateKey {
  return (
    typeof value === "string" &&
    (CERTIFICATE_TEMPLATES as readonly string[]).includes(value)
  );
}
