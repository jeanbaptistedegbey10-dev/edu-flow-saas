// --------------------------------------
// Sanitisation des payloads d'audit
// --------------------------------------
//
// COUCHE DE SÉCURITÉ (défense en profondeur). Aucun mot de passe, jeton
// d'authentification, clé d'API, secret, donnée bancaire (carte, CVV, IBAN)
// ni autre donnée hautement confidentielle ne doit être stocké OU affiché dans
// le journal d'audit.
//
// La sanitisation est appliquée à DEUX endroits :
//  1. `@/lib/actions/audit` → `logAuditEvent` (écriture) : les données
//     sensibles ne sont jamais persistées en base ;
//  2. `@/lib/audit-labels` → `formatAuditDetails` (affichage) : les lignes
//     historiques écrites AVANT l'introduction de cette couche sont également
//     protégées à la lecture.
//
// Module SANS « use server » et SANS dépendance serveur (utilisable côté
// client comme côté serveur).

/** Valeur affichée à la place d'une donnée sensible. */
export const AUDIT_REDACTED_PLACEHOLDER = "••• (donnée sensible masquée)";

/**
 * Motifs de CLÉS sensibles — testés en minuscules sur la clé entière.
 *
 * Volontairement larges : une clé d'audit non identifiée ici reste inoffensive
 * (elle est simplement affichée telle quelle), tandis qu'une clé forgot
 * introduite plus tard est neutralisée par défaut.
 */
const SENSITIVE_KEY_PATTERNS: readonly RegExp[] = [
  /pass(word|wd|phrase)?/,
  /\bpwd\b/,
  /secret/,
  /token/,
  /\bapi[-_]?key/,
  /authorization/,
  /\bcookie\b/,
  /credential/,
  /private[-_]?key/,
  /license[-_]?key/,
  /signature/,
  /\bsalt\b/,
  /\bhash\b/,
  /card[-_]?(number|no|cvv|cvc|holder)/,
  /\bcvv\b/,
  /\bcvc\b/,
  /\bpin\b/,
  /\botp\b/,
  /\biban\b/,
  /bank[-_]?account/,
  /routing[-_]?number/,
  /\bssn\b/,
];

/**
 * Motifs de VALEURS sensibles — appliqués même quand la clé est anodine
 * (ex : `details: { note: "eyJhbGciOi…" }`).
 */
const SENSITIVE_VALUE_PATTERNS: readonly RegExp[] = [
  // JWT (header base64 « eyJ… » + signature).
  /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
  // Clés fournisseurs connus (Stripe, GitLab, Slack, Twilio, Kkiapay…).
  /^(sk|pk|rk|whsec|glpat|xox[baprs]|kp_live|kp_test)[-_][A-Za-z0-9_-]{8,}/i,
  // Suite de 12 à 19 chiffres : numéro de carte bancaire probable.
  /^\d{12,19}$/,
];

/** Profondeur maximale d'imbrication retenue dans le payload d'audit. */
const MAX_DEPTH = 4;
/** Nombre maximal de clés conservées par objet. */
const MAX_KEYS = 40;
/** Nombre maximal d'éléments conservés par tableau. */
const MAX_ARRAY_ITEMS = 25;
/** Longueur maximale d'une chaîne conservée. */
const MAX_STRING_LENGTH = 500;

/** Vrai si la clé correspond à un motif de donnée sensible. */
export function isSensitiveAuditKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Vrai si la valeur ressemble à un secret (JWT, clé fournisseur, carte). */
export function isSensitiveAuditValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** Vrai si la valeur est un objet JSON « plat » (ni tableau, ni null). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncateString(value: string): string {
  if (value.length <= MAX_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_STRING_LENGTH)}…`;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    return isSensitiveAuditValue(value)
      ? AUDIT_REDACTED_PLACEHOLDER
      : truncateString(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    if (depth >= MAX_DEPTH) return "[donnée imbriquée tronquée]";

    const sanitized: Record<string, unknown> = {};
    let kept = 0;

    for (const [key, item] of Object.entries(value)) {
      if (kept >= MAX_KEYS) break;
      // Clé sensible : la valeur est SUPPRIMÉE (jamais masquée en base).
      if (isSensitiveAuditKey(key)) continue;
      sanitized[key] = sanitizeValue(item, depth + 1);
      kept += 1;
    }

    return sanitized;
  }

  // Fonction, symbole, BigInt… : rien de JSON exploitable.
  return null;
}

/**
 * Nettoie le champ `details` d'une entrée d'audit avant enregistrement.
 *
 * - supprime les clés sensibles (mot de passe, jeton, clé d'API, carte, IBAN…) ;
 * - masque les valeurs qui RESSEMBLENT à un secret, même sous une clé anodine ;
 * - borne la profondeur, le nombre de clés, la taille des tableaux et la
 *   longueur des chaînes (empêche les payloads démesurés).
 *
 * Renvoie `null` si aucune donnée exploitable ne subsiste : l'entrée est alors
 * enregistrée sans `details` plutôt qu'avec un objet vide.
 */
export function sanitizeAuditDetails(
  details: unknown
): Record<string, unknown> | null {
  if (details === null || details === undefined) return null;

  if (!isPlainObject(details)) {
    const sanitizedScalar = sanitizeValue(details, 0);
    return isPlainObject(sanitizedScalar) ? sanitizedScalar : null;
  }

  const sanitized = sanitizeValue(details, 0);
  if (!isPlainObject(sanitized)) return null;

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}