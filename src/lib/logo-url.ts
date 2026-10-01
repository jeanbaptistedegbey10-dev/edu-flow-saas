// --------------------------------------
// Validation des URL de logo (module PUR)
// --------------------------------------
//
// Ce module ne contient QUE des constantes et une fonction de validation : il
// est donc importable aussi bien par le serveur (`platform-settings.ts`, les
// Server Actions) que par les composants clients (formulaires de logo).
//
// Il ne doit PAS importer `server-only`, Prisma, ni quoi que ce soit de lié à
// la base — il est volontairement autonome.
//
// Les règles appliquées sont identiques à celles du logo d'organisation
// (`src/actions/organization.ts`) : un logo vaut soit un chemin interne servi
// par `public/`, soit une URL http(s), soit une data URL d'image issue d'un
// import local recadré.

/**
 * Longueur maximale de la valeur stockée en base (longueur de la data URL ou de
 * l'URL) — alignée sur la validation serveur du logo d'organisation.
 */
export const LOGO_MAX_VALUE_LENGTH = 500_000;

/** Chemin interne servi par `public/` (ex : « /logo.png », « /branding/x.svg »). */
const INTERNAL_ASSET_PATH_PATTERN = /^\/[\w.-]+(?:\/[\w.-]+)*$/;

/** URL http(s) distante (CDN, espace de stockage…). */
const HTTP_URL_PATTERN = /^https?:\/\/\S+$/i;

/** Data URL d'image en base64 (import local recadré côté client). */
const DATA_IMAGE_URL_PATTERN =
  /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i;

/**
 * `true` si la valeur est exploitable comme source d'image.
 *
 * Les schémas dangereux (`javascript:`, `data:text/html`, chemins de fichiers
 * locaux…) sont rejetés : la valeur finit dans un attribut `src`, elle ne doit
 * jamais pouvoir introduire de script.
 */
export function isValidLogoUrl(value: string): boolean {
  return (
    INTERNAL_ASSET_PATH_PATTERN.test(value) ||
    HTTP_URL_PATTERN.test(value) ||
    DATA_IMAGE_URL_PATTERN.test(value)
  );
}
