"use strict";
// =============================================================================
// EduFlow Desktop — Vérificateur de licence OFFLINE (Ed25519)
// =============================================================================
// Réplique fidèle (CommonJS, ZÉRO dépendance) des algorithmes de
// `src/lib/crypto-license.ts` (Node.js crypto, courbe Ed25519) utilisés par
// le back-office Super-Admin.
//
//   • Aucun appel réseau, aucune base de données : la clé PUBLIQUE embarquée
//     dans l'exécutable suffit.
//   • Accepte une clé au format humanisé `EDU-XXXXX-…-CCCC` (erreurs de
//     frappe détectées par checksum) ou le token compact `base64url.sig`.
//   • Détecte l'expiration (`payload.expiresAt`) ; le processus principal
//     exige une clé valide au premier démarrage et à chaque expiration.
//
// La compatibilité entre ce module et `src/lib/crypto-license.ts` est
// couverte par `scripts/check-license-desktop-compat.mts`.
// =============================================================================

const { createHash, createPublicKey, verify: cryptoVerify } = require("crypto");

const LICENSE_KEY_PREFIX = "EDU";
const LICENSE_KEY_GROUP_SIZE = 5;
const LICENSE_KEY_CHECKSUM_LENGTH = 4;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// Doit correspondre exactement à `LICENSE_PLAN_TYPES` de src/lib/plan-labels.ts.
const LICENSE_PLAN_TYPES = [
  "SAAS_MONTHLY",
  "SAAS_YEARLY",
  "SELF_HOSTED",
  "OFFLINE",
];

/**
 * Normalise une PEM stockée / embarquée : les éditeurs remplacent parfois les
 * retours à la ligne par des séquences littérales `\n`.
 */
function normalizePem(value) {
  return String(value).trim().replace(/\\n/g, "\n");
}

/** Encodage Base32 RFC 4648 (A-Z, 2-7), sans padding. */
function base32Encode(bytes) {
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

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}
/** Décodage Base32 RFC 4648 (tolère casse / caractères parasites). */
function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/[^A-Z2-7]/g, "");

  if (clean.length === 0) {
    return null;
  }

  const bytes = [];
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

/** Checksum de détection d'erreurs de frappe (4 caractères Base32). */
function computeChecksum(compactToken) {
  const digest = createHash("sha256").update(compactToken, "utf8").digest();

  return base32Encode(digest.subarray(0, 4)).slice(
    0,
    LICENSE_KEY_CHECKSUM_LENGTH
  );
}

/**
 * Normalise une clé saisie :
 *   - `null`        → format méconnaissable ;
 *   - `"CHECKSUM"`  → erreur de frappe détectée ;
 *   - `{ compact }` → token compact `payload.signature` exploitable.
 */
function normalizeLicenseKeyInput(licenseKey) {
  const trimmed = String(licenseKey ?? "").trim();

  if (trimmed.length === 0) {
    return null;
  }

  // Token compact : exactement un point séparateur.
  if (trimmed.includes(".")) {
    const parts = trimmed.split(".");

    if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
      return null;
    }

    return { compact: `${parts[0]}.${parts[1]}` };
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
/** Validation du payload embarqué (mêmes règles que le module Serveur). */
function isLicensePayload(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value;

  return (
    typeof candidate.organizationId === "string" &&
    candidate.organizationId.length > 0 &&
    typeof candidate.planType === "string" &&
    LICENSE_PLAN_TYPES.includes(candidate.planType) &&
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

// Raisons possibles de refus (identiques à LicenseVerificationError).
const VERIFICATION_REASONS = [
  "MALFORMED",
  "CHECKSUM_INVALID",
  "INVALID_PAYLOAD",
  "INVALID_SIGNATURE",
  "EXPIRED",
  "PUBLIC_KEY_INVALID",
];

/**
 * Vérifie hors-ligne une clé de licence.
 *
 * @param {string} licenseKey  Clé `EDU-…` ou token compact.
 * @param {string} publicKeyPem Clé PUBLIQUE Ed25519 (PEM SPKI).
 * @returns {{valid:boolean, reason?:string, payload?:object, expiresAt?:Date}}
 */
function verifyLicenseKey(licenseKey, publicKeyPem) {
  try {
    const normalized = normalizeLicenseKeyInput(licenseKey);

    if (normalized === null) {
      return { valid: false, reason: "MALFORMED" };
    }

    if (normalized === "CHECKSUM") {
      return { valid: false, reason: "CHECKSUM_INVALID" };
    }

    const [payloadPart, signaturePart] = normalized.compact.split(".");

    let payloadBytes;
    let signatureBytes;

    try {
      payloadBytes = Buffer.from(payloadPart, "base64url");
      signatureBytes = Buffer.from(signaturePart, "base64url");
    } catch {
      return { valid: false, reason: "MALFORMED" };
    }

    if (payloadBytes.length === 0 || signatureBytes.length === 0) {
      return { valid: false, reason: "MALFORMED" };
    }

    let parsed;

    try {
      parsed = JSON.parse(payloadBytes.toString("utf8"));
    } catch {
      return { valid: false, reason: "MALFORMED" };
    }

    if (!isLicensePayload(parsed)) {
      return { valid: false, reason: "INVALID_PAYLOAD" };
    }

    let key;

    try {
      key = createPublicKey(normalizePem(publicKeyPem));
    } catch {
      // Clé publique absente/corrompue : problème de configuration de
      // l'exécutable, pas de la licence saisie.
      return { valid: false, reason: "PUBLIC_KEY_INVALID", payload: parsed };
    }

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
  } catch {
    return { valid: false, reason: "MALFORMED" };
  }
}

module.exports = {
  LICENSE_KEY_PREFIX,
  VERIFICATION_REASONS,
  normalizeLicenseKeyInput,
  verifyLicenseKey,
};