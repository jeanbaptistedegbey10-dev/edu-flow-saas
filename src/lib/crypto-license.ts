// --------------------------------------
// Moteur de licences cryptographiques (Ed25519)
// --------------------------------------
//
// Génération et vérification HORS-LIGNE de clés de licence signées
// asymétriquement (Node.js `crypto`, courbe Ed25519) :
//
//   1. Le payload JSON est sérialisé de façon canonique (ordre de clés fixe) ;
//   2. Il est signé avec la clé PRIVÉE de la plateforme (Super-Admin) ;
//   3. La clé de licence = token compact `base64url(payload).base64url(sig)`
//      mis en forme pour lecture humaine : `EDU-XXXXX-XXXXX-…-CCCC`
//      (Base32 RFC 4648, insensible à la casse, tirets optionnels, groupe
//      final `CCCC` = checksum SHA-256 de détection d'erreurs de frappe) ;
//   4. La vérification n'utilise QUE la clé PUBLIQUE : aucun appel réseau,
//      aucun accès base de données — utilisable sur une installation
//      SELF_HOSTED / OFFLINE entièrement isolée.
//
// Variables d'environnement attendues (PEM multilignes entre guillemets) :
//   - LICENSE_PRIVATE_KEY : signature des licences (Super-Admin uniquement) ;
//   - LICENSE_PUBLIC_KEY  : vérification (toute instance, y compris cliente).

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from "crypto";

import { LICENSE_PLAN_TYPES, type LicensePlanType } from "@/lib/plan-labels";

// --------------------------------------
// Types publics
// --------------------------------------

/** Payload signé embarqué dans chaque clé de licence. */
export type LicensePayload = {
  organizationId: string;
  planType: LicensePlanType;
  /** Date d'expiration de la licence (ISO 8601). */
  expiresAt: string;
  /** Plafond optionnel d'étudiants actifs. */
  maxStudents?: number;
  /** Plafond optionnel d'utilisateurs (membres de l'équipe). */
  maxUsers?: number;
};

/** Raisons possibles d'invalidité d'une clé de licence. */
export type LicenseVerificationError =
  | "MALFORMED"
  | "CHECKSUM_INVALID"
  | "INVALID_PAYLOAD"
  | "INVALID_SIGNATURE"
  | "EXPIRED";

/** Résultat de `verifyLicenseKey`. */
export type LicenseVerificationResult =
  | {
      valid: true;
      payload: LicensePayload;
      /** Date d'expiration parsée. */
      expiresAt: Date;
    }
  | {
      valid: false;
      reason: LicenseVerificationError;
      /** Payload extrait si l'erreur le permet (utile pour diagnostiquer). */
      payload?: LicensePayload;
      expiresAt?: Date;
    };

// --------------------------------------
// Constantes
// --------------------------------------

/** Préfixe du format humanisé des clés de licence. */
export const LICENSE_KEY_PREFIX = "EDU";

/** Taille des groupes du format humanisé (`EDU-XXXXX-…`). */
const LICENSE_KEY_GROUP_SIZE = 5;

/** Longueur du groupe de checksum (Base32, 4 caractères). */
const LICENSE_KEY_CHECKSUM_LENGTH = 4;

/** Alphabet Base32 RFC 4648 (A-Z, 2-7) : insensible à la casse. */
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Durée d'une licence « perpétuelle » (en mois) : 100 ans. La spécification
 * du payload impose une `expiresAt` ISO : pour les licences sans échéance
 * commerciale, on encode une date très éloignée plutôt qu'une sentinelle.
 */
export const PERPETUAL_LICENSE_MONTHS = 1200;

// --------------------------------------
// Gestion des clés (variables d'environnement)
// --------------------------------------

/**
 * Normalise une PEM stockée en variable d'environnement : certains hébergeurs
 * ou éditeurs remplacent les retours à la ligne par des séquences littérales
 * `\n` — on les restaure pour que `createPrivateKey` puisse parser la clé.
 */
function normalizePem(value: string): string {
  return value.trim().replace(/\\n/g, "\n");
}

/** Clé privée de signature de la plateforme (server-side uniquement). */
export function getLicensePrivateKey(): KeyObject {
  const raw = process.env.LICENSE_PRIVATE_KEY;

  if (!raw) {
    throw new Error(
      "[crypto-license] LICENSE_PRIVATE_KEY n'est pas définie. " +
        "Générez un couple Ed25519 (node -e ou scripts/license-keygen.ts) et " +
        "renseignez LICENSE_PRIVATE_KEY / LICENSE_PUBLIC_KEY dans .env."
    );
  }

  try {
    return createPrivateKey(normalizePem(raw));
  } catch {
    throw new Error(
      "[crypto-license] LICENSE_PRIVATE_KEY est définie mais invalide " +
        "(PEM Ed25519 PKCS#8 attendu)."
    );
  }
}

/** Clé publique de vérification (lecture hors-ligne, aucune dépendance). */
export function getLicensePublicKey(): KeyObject {
  const raw = process.env.LICENSE_PUBLIC_KEY;

  if (!raw) {
    throw new Error(
      "[crypto-license] LICENSE_PUBLIC_KEY n'est pas définie. " +
        "Renseignez la clé publique Ed25519 (SPKI) correspondant à " +
        "LICENSE_PRIVATE_KEY dans .env."
    );
  }

  try {
    return createPublicKey(normalizePem(raw));
  } catch {
    throw new Error(
      "[crypto-license] LICENSE_PUBLIC_KEY est définie mais invalide " +
        "(PEM Ed25519 SPKI attendu)."
    );
  }
}

/**
 * Génère un nouveau couple de clés Ed25519 (PKCS#8 privé / SPKI public),
 * prêt à être copié dans `.env`. Usage : provisionnement de la plateforme
 * uniquement — la clé privée ne doit JAMAIS quitter le back-office.
 */
export function generateLicenseKeyPair(): {
  privateKeyPem: string;
  publicKeyPem: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");

  return {
    privateKeyPem: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

// --------------------------------------
// Encodage Base32 (RFC 4648) — format humanisé
// --------------------------------------

function base32Encode(bytes: Uint8Array): string {
  let output = "";
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  // Dernier groupe partiel : padding implicite à zéro (aucun caractère « = » ;
  // le décodage ignore simplement les bits excédentaires).
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string): Buffer | null {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");

  if (clean.length === 0) {
    return null;
  }

  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);

    if (index === -1) {
      return null;
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

// --------------------------------------
// Token compact & checksum
// --------------------------------------

/**
 * Sérialisation canonique du payload : l'ordre des clés est FIXE, de sorte
 * qu'un même payload produise toujours la même empreinte signée.
 */
function canonicalizePayload(payload: LicensePayload): string {
  const canonical: Record<string, unknown> = {
    organizationId: payload.organizationId,
    planType: payload.planType,
    expiresAt: payload.expiresAt,
  };

  if (payload.maxStudents !== undefined) {
    canonical.maxStudents = payload.maxStudents;
  }

  if (payload.maxUsers !== undefined) {
    canonical.maxUsers = payload.maxUsers;
  }

  return JSON.stringify(canonical);
}

/** Token compact `base64url(payload).base64url(signature)`. */
function encodeCompactToken(
  payload: LicensePayload,
  privateKey: string | KeyObject
): string {
  const payloadBytes = Buffer.from(canonicalizePayload(payload), "utf8");
  const signature = cryptoSign(null, payloadBytes, privateKey);

  return `${payloadBytes.toString("base64url")}.${signature.toString("base64url")}`;
}

/** Checksum de détection d'erreurs de frappe (4 caractères Base32). */
function computeChecksum(compactToken: string): string {
  const digest = createHash("sha256").update(compactToken, "utf8").digest();

  return base32Encode(digest.subarray(0, 4)).slice(
    0,
    LICENSE_KEY_CHECKSUM_LENGTH
  );
}

/** Met en forme un token compact : `EDU-XXXXX-XXXXX-…-CCCC`. */
export function formatLicenseToken(compactToken: string): string {
  const encoded = base32Encode(Buffer.from(compactToken, "utf8"));
  const groups: string[] = [];

  for (let i = 0; i < encoded.length; i += LICENSE_KEY_GROUP_SIZE) {
    groups.push(encoded.slice(i, i + LICENSE_KEY_GROUP_SIZE));
  }

  return [
    LICENSE_KEY_PREFIX,
    ...groups,
    computeChecksum(compactToken),
  ].join("-");
}

/**
 * Normalise une clé saisie (copier-coller, re-saisie manuelle ou token
 * compact brut) et retourne le token compact sous-jacent.
 *
 * - `null`            → format méconnaissable ;
 * - `"CHECKSUM"`      → groupe de contrôle invalide (erreur de frappe) ;
 * - `{ compact }`     → clé exploitable.
 */
export function normalizeLicenseKeyInput(
  licenseKey: string
): { compact: string } | null | "CHECKSUM" {
  const trimmed = licenseKey.trim();

  if (trimmed.length === 0) {
    return null;
  }

  // Un token compact contient exactement un point (`payload.signature`) ;
  // une clé humanisée n'en contient jamais. On accepte les deux formats.
  if (trimmed.includes(".")) {
    const parts = trimmed.split(".");

    if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
      return null;
    }

    return { compact: parts[0] + "." + parts[1] };
  }

  // Format humanisé : on retire préfixe, tirets, espaces et ponctuation.
  const stripped = trimmed
    .toUpperCase()
    .replace(new RegExp(`^${LICENSE_KEY_PREFIX}[-_]?`), "")
    .replace(/[^A-Z2-7]/g, "");

  if (stripped.length <= LICENSE_KEY_CHECKSUM_LENGTH) {
    return null;
  }

  const body = stripped.slice(0, -LICENSE_KEY_CHECKSUM_LENGTH);
  const checksum = stripped.slice(-LICENSE_KEY_CHECKSUM_LENGTH);
  const decoded = base32Decode(body);

  if (!decoded) {
    return null;
  }

  const compact = decoded.toString("utf8");

  if (computeChecksum(compact) !== checksum) {
    return "CHECKSUM";
  }

  return { compact };
}

// --------------------------------------
// Génération & vérification
// --------------------------------------

/**
 * Génère et signe une clé de licence au format humanisé :
 * `EDU-XXXXX-XXXXX-…-CCCC`.
 *
 * @param payload     Payload à embarquer (organisation, plan, expiration…).
 * @param privateKey  PEM privé Ed25519 (PKCS#8). Par défaut :
 *                    `process.env.LICENSE_PRIVATE_KEY`.
 */
export function generateLicenseKey(
  payload: LicensePayload,
  privateKey?: string | KeyObject
): string {
  // Validation à la source : une clé invalide ne doit jamais être émise.
  assertValidPayload(payload);

  const key = privateKey ?? getLicensePrivateKey();
  const compact = encodeCompactToken(payload, key);

  return formatLicenseToken(compact);
}

/**
 * Vérifie l'authenticité d'une clé de licence HORS-LIGNE (aucun réseau,
 * aucune base de données) : contrôle du format/checksum, de la signature
 * Ed25519, de la cohérence du payload, puis de la date d'expiration.
 *
 * @param licenseKey  Clé au format humanisé `EDU-…` ou token compact brut.
 * @param publicKey   PEM public Ed25519 (SPKI). Par défaut :
 *                    `process.env.LICENSE_PUBLIC_KEY`.
 */
export function verifyLicenseKey(
  licenseKey: string,
  publicKey?: string | KeyObject
): LicenseVerificationResult {
  const normalized = normalizeLicenseKeyInput(licenseKey);

  if (normalized === null) {
    return { valid: false, reason: "MALFORMED" };
  }

  if (normalized === "CHECKSUM") {
    return { valid: false, reason: "CHECKSUM_INVALID" };
  }

  const [payloadPart, signaturePart] = normalized.compact.split(".");

  let payloadBytes: Buffer;
  let signatureBytes: Buffer;

  try {
    payloadBytes = Buffer.from(payloadPart, "base64url");
    signatureBytes = Buffer.from(signaturePart, "base64url");
  } catch {
    return { valid: false, reason: "MALFORMED" };
  }

  if (payloadBytes.length === 0 || signatureBytes.length === 0) {
    return { valid: false, reason: "MALFORMED" };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    return { valid: false, reason: "MALFORMED" };
  }

  if (!isLicensePayload(parsed)) {
    return { valid: false, reason: "INVALID_PAYLOAD" };
  }

  const key = publicKey ?? getLicensePublicKey();
  const isSignatureValid = cryptoVerify(
    null,
    payloadBytes,
    key,
    signatureBytes
  );

  if (!isSignatureValid) {
    return { valid: false, reason: "INVALID_SIGNATURE", payload: parsed };
  }

  const expiresAt = new Date(parsed.expiresAt);

  if (expiresAt.getTime() <= Date.now()) {
    return { valid: false, reason: "EXPIRED", payload: parsed, expiresAt };
  }

  return { valid: true, payload: parsed, expiresAt };
}

// --------------------------------------
// Validation du payload
// --------------------------------------

function isLicensePayload(value: unknown): value is LicensePayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<LicensePayload>;

  return (
    typeof candidate.organizationId === "string" &&
    candidate.organizationId.length > 0 &&
    typeof candidate.planType === "string" &&
    (LICENSE_PLAN_TYPES as readonly string[]).includes(candidate.planType) &&
    typeof candidate.expiresAt === "string" &&
    !Number.isNaN(new Date(candidate.expiresAt).getTime()) &&
    (candidate.maxStudents === undefined ||
      (typeof candidate.maxStudents === "number" &&
        Number.isInteger(candidate.maxStudents) &&
        candidate.maxStudents > 0)) &&
    (candidate.maxUsers === undefined ||
      (typeof candidate.maxUsers === "number" &&
        Number.isInteger(candidate.maxUsers) &&
        candidate.maxUsers > 0))
  );
}

/** Lève une erreur explicite si le payload ne respecte pas le contrat. */
export function assertValidPayload(payload: LicensePayload): void {
  if (!isLicensePayload(payload)) {
    throw new Error(
      "[crypto-license] Payload de licence invalide : organizationId, " +
        `planType (${LICENSE_PLAN_TYPES.join(" | ")}), expiresAt (ISO) et ` +
        "éventuellement maxStudents/maxUsers (entiers positifs) sont requis."
    );
  }
}

// --------------------------------------
// Utilitaires de dates (durées de licence)
// --------------------------------------

/**
 * Ajoute `months` mois à une date, avec resserrage de fin de mois
 * (31/01 + 1 mois → 28/02 et non 03/03).
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const dayOfMonth = result.getDate();

  result.setMonth(result.getMonth() + months);

  if (result.getDate() < dayOfMonth) {
    result.setDate(0);
  }

  return result;
}

/** Date d'expiration d'une licence « perpétuelle » (100 ans). */
export function computePerpetualExpiry(from: Date = new Date()): Date {
  return addMonths(from, PERPETUAL_LICENSE_MONTHS);
}




