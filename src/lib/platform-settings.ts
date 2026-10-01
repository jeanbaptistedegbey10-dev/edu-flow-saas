import "server-only";

import { isValidLogoUrl, LOGO_MAX_VALUE_LENGTH } from "@/lib/logo-url";
import { prisma } from "@/lib/prisma";

// --------------------------------------
// Paramètres globaux de la plateforme
// --------------------------------------
//
// Le back-office Super-Admin peut configurer des réglages qui s'appliquent à
// TOUTES les organisations de la plateforme. Ils sont persistés dans la table
// `SystemSettings` (modèle clé/valeur : `key`, `value`, `label`, `category`).
//
// La stratégie de résolution est volontairement identique à celle des clés de
// paiement (`src/lib/payment.ts`) :
//   1. Valeur enregistrée en base (`SystemSettings`) ;
//   2. Valeur par défaut codée en dur (`FALLBACK_*`) si la clé est absente ou
//      vide ;
//   3. En cas d'indisponibilité de la base, on retombe sur (2) au lieu de
//      faire échouer l'opération appelante (création d'organisation, injection
//      de démo…).
//
// RÈGLE : ce module est « server-only » — il n'est jamais importé depuis un
// composant client. Les constantes exportées restent lisibles partout.

/**
 * Clé de `SystemSettings` contenant l'URL du logo appliqué par défaut aux
 * nouvelles organisations.
 */
export const DEFAULT_ORGANIZATION_LOGO_KEY = "default_organization_logo_url";

/**
 * Logo utilisé quand le Super-Admin n'a rien configuré : asset statique servi
 * par `public/`, résolu directement par le navigateur.
 *
 * Ce chemin DOIT rester synchronisé avec l'asset régénérable via
 * `scripts/generate-default-logo.mjs`.
 */
export const FALLBACK_DEFAULT_ORGANIZATION_LOGO_URL = "/logo.png";

/** Étiquette affichée dans le back-office Super-Admin. */
export const DEFAULT_ORGANIZATION_LOGO_LABEL = "Logo par défaut des organisations";

/** Catégorie de regroupement dans `SystemSettings`. */
export const PLATFORM_SETTINGS_CATEGORY = "branding";

/**
 * Lit le logo par défaut depuis `SystemSettings`.
 *
 * Renvoie TOUJOURS une valeur exploitable : la valeur configurée si elle est
 * valide, sinon `FALLBACK_DEFAULT_ORGANIZATION_LOGO_URL`. Ne lève jamais
 * (indisponibilité de la base journalisée et repli sur le défaut).
 */
export async function getDefaultOrganizationLogoUrl(): Promise<string> {
  try {
    const record = await prisma.systemSettings.findUnique({
      where: { key: DEFAULT_ORGANIZATION_LOGO_KEY },
      select: { value: true },
    });

    const value = record?.value?.trim();

    if (value && value.length <= LOGO_MAX_VALUE_LENGTH && isValidLogoUrl(value)) {
      return value;
    }
  } catch (error) {
    console.error(
      "[platform-settings] Lecture du logo par défaut impossible — repli sur le logo EduFlow",
      error
    );
  }

  return FALLBACK_DEFAULT_ORGANIZATION_LOGO_URL;
}

/** Vue exposée au back-office (valeur effective + provenance). */
export type DefaultOrganizationLogoSetting = {
  /** Valeur actuellement enregistrée en base (vide si non configurée). */
  configuredValue: string;
  /** Valeur réellement appliquée (configuration valide, sinon repli). */
  effectiveValue: string;
  /** `true` si la valeur provient de `SystemSettings`. */
  isCustomized: boolean;
  /** Repli appliqué quand aucune configuration valide n'est enregistrée. */
  fallbackValue: string;
};

/** Détail du logo par défaut pour l'UI Super-Admin. */
export async function getDefaultOrganizationLogoSetting(): Promise<DefaultOrganizationLogoSetting> {
  let configuredValue = "";

  try {
    const record = await prisma.systemSettings.findUnique({
      where: { key: DEFAULT_ORGANIZATION_LOGO_KEY },
      select: { value: true },
    });
    configuredValue = record?.value?.trim() ?? "";
  } catch (error) {
    console.error(
      "[platform-settings] Lecture du paramètre de logo impossible",
      error
    );
  }

  const effectiveValue =
    configuredValue &&
    configuredValue.length <= LOGO_MAX_VALUE_LENGTH &&
    isValidLogoUrl(configuredValue)
      ? configuredValue
      : FALLBACK_DEFAULT_ORGANIZATION_LOGO_URL;

  return {
    configuredValue,
    effectiveValue,
    isCustomized: effectiveValue === configuredValue,
    fallbackValue: FALLBACK_DEFAULT_ORGANIZATION_LOGO_URL,
  };
}
