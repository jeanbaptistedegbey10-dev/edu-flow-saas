/**
 * Validation Zod des payloads de webhook de paiement.
 *
 * SÉCURITÉ : le corps du webhook est signé (HMAC) mais reste une ENTRÉE
 * EXTERNE. La signature prouve l'origine, pas la validité du contenu : sans
 * schéma strict, un `organizationId` mal typé ou une durée aberrante pourrait
 * se propager jusqu'à Prisma. On valide donc la forme AVANT toute
 * normalisation, avec `.safeParse()` (contrôlé) ou `.parse()` (lève).
 *
 * Les schémas sont volontairement PERMISSIFS sur les enveloppes d'agrégateur
 * (`data`, `entity`, `custom_data`, `stateData` peuvent être absents) mais
 * STRICTS sur le type et la longueur des valeurs utilisées métier : cela
 * préserve la tolérance aux évolutions d'API des fournisseurs sans jamais
 * laisser passer une chaîne arbitrairement longue ou un nombre non fini.
 */
import { z } from "zod";

/** Longueur maximale d'un identifiant / code de transaction. */
const MAX_REFERENCE_LENGTH = 200;
/** Longueur maximale d'un identifiant d'organisation (cuid). */
const MAX_ID_LENGTH = 64;
/** Longueur maximale d'un libellé (moyen de paiement). */
const MAX_LABEL_LENGTH = 64;
/** Montant plausible : borne haute pour écarter les valeurs aberrantes. */
const MAX_AMOUNT = 100_000_000;

/** Identifiant d'organisation : cuid Prisma (jamais de chaîne libre). */
const organizationIdSchema = z
  .string()
  .trim()
  .min(1, "organizationId vide")
  .max(MAX_ID_LENGTH, "organizationId trop long")
  // Un cuid est alphanumérique ; on refuse espaces et caractères de contrôle,
  // qui signaleraient une tentative d'injection en aval.
  .regex(/^[A-Za-z0-9_-]+$/, "organizationId contient des caractères interdits");

/** Formule commerciale : liste blanche (cf. `isPricingPlanType`). */
const planTypeSchema = z
  .string()
  .trim()
  .min(1, "planType vide")
  .max(32, "planType trop long")
  .regex(/^[A-Z_]+$/, "planType doit être un identifiant en majuscules");

/** Durée souscrite : 6 ou 12 mois (cf. `isBillingDuration`). */
const durationMonthsSchema = z
  .number()
  .int("durationMonths doit être un entier")
  .min(1, "durationMonths hors bornes")
  .max(60, "durationMonths hors bornes");

/** Référence de transaction fournie par l'agrégateur. */
const transactionReferenceSchema = z
  .string()
  .trim()
  .min(1, "référence vide")
  .max(MAX_REFERENCE_LENGTH, "référence trop longue");

/** Montant payé. */
const amountSchema = z
  .number()
  .finite("montant non fini")
  .min(0, "montant négatif")
  .max(MAX_AMOUNT, "montant aberrant");

/** Libellé libre (moyen de paiement). */
const labelSchema = z.string().trim().max(MAX_LABEL_LENGTH).optional();

/**
 * Enveloppe d'objets acceptée par les normaliseurs.
 * `nullish()` : chaque normaliseur sait traiter l'absence ou le null.
 */
const looseRecord = z.record(z.string(), z.unknown()).nullish();


// --------------------------------------
// Schémas d'enveloppe (par agrégateur)
// --------------------------------------

/** Payload Kkiapay (`data` + `stateData`). */
export const kkiapayWebhookSchema = z.object({
  name: z.string().trim().max(MAX_LABEL_LENGTH).optional(),
  data: looseRecord,
  stateData: looseRecord,
});

/** Payload FedaPay (`entity` + `custom_data`). */
export const fedapayWebhookSchema = z.object({
  name: z.string().trim().max(MAX_LABEL_LENGTH).optional(),
  entity: looseRecord,
});

/**
 * Metadata de la notification : ce qui identifie l'organisation à créditer.
 * Validée STRICTEMENT car elle conditionne l'écriture en base.
 */
export const webhookMetadataSchema = z.object({
  organizationId: organizationIdSchema,
  planType: planTypeSchema,
  durationMonths: durationMonthsSchema,
});

/**
 * Valide l'ENVELOPPE du webhook avant normalisation.
 *
 * @returns `{ valid: true }` si l'enveloppe est conforme ; sinon la raison
 *          du rejet (jamais le contenu brut du payload).
 */
export function validateWebhookEnvelope(
  provider: "fedapay" | "kkiapay",
  payload: unknown
): { valid: true } | { valid: false; reason: string } {
  const schema =
    provider === "kkiapay" ? kkiapayWebhookSchema : fedapayWebhookSchema;

  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") || "(racine)";

    return {
      valid: false,
      reason: `Payload de webhook invalide en « ${path} » : ${issue?.message ?? "format inattendu"}.`,
    };
  }

  return { valid: true };
}

/**
 * Valide les METADATA normalisées (organizationId / planType /
 * durationMonths) avant toute écriture en base.
 *
 * Équivalent défensif de `isPricingPlanType` + `isBillingDuration`, mais
 * centralisé, typé et réutilisable.
 */
export function validateWebhookMetadata(metadata: {
  organizationId?: string;
  planType?: string;
  durationMonths?: number;
}): { valid: true } | { valid: false; reason: string } {
  const parsed = webhookMetadataSchema.safeParse(metadata);

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join(".") || "(racine)";

    return {
      valid: false,
      reason: `Metadata de webhook invalide en « ${path} » : ${issue?.message ?? "valeur absente"}.`,
    };
  }

  return { valid: true };
}

/** Valide une référence de transaction avant persistance. */
export function validateTransactionReference(
  value: unknown
): { valid: true; value: string | null } | { valid: false; reason: string } {
  if (value === null || value === undefined) {
    return { valid: true, value: null };
  }

  const parsed = transactionReferenceSchema.safeParse(value);

  if (!parsed.success) {
    return { valid: false, reason: "Référence de transaction invalide." };
  }

  return { valid: true, value: parsed.data };
}

/** Valide un montant avant persistance. */
export function validateWebhookAmount(
  value: unknown
): { valid: true; value: number | null } | { valid: false; reason: string } {
  if (value === null || value === undefined) {
    return { valid: true, value: null };
  }

  const parsed = amountSchema.safeParse(value);

  if (!parsed.success) {
    return { valid: false, reason: "Montant de paiement invalide." };
  }

  return { valid: true, value: parsed.data };
}

/** Valide un libellé libre (moyen de paiement) avant persistance. */
export function validateWebhookLabel(
  value: unknown
): { valid: true; value: string | null } | { valid: false; reason: string } {
  if (value === null || value === undefined) {
    return { valid: true, value: null };
  }

  const parsed = labelSchema.safeParse(value);

  if (!parsed.success) {
    return { valid: false, reason: "Moyen de paiement invalide." };
  }

  return { valid: true, value: parsed.data ?? null };
}
