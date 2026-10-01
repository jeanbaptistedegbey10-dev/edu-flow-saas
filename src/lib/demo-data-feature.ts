// --------------------------------------
// Données de démonstration — garde d'activation (OPT-OUT)
// --------------------------------------
//
// Source de vérité UNIQUE de l'activation de la carte « Données de
// démonstration » et de l'« Historique des sauvegardes » :
//   - affichage  : `src/app/dashboard/page.tsx`
//   - exécutions : `src/lib/actions/demo-data.ts` (défense en profondeur)
//
// RÈGLE : la fonctionnalité est ACTIVE PAR DÉFAUT, y compris en production.
// Elle ne se désactive QUE par une désactivation explicite :
//
//   NEXT_PUBLIC_ENABLE_DEMO_DATA="false"   →  carte masquée, actions refusées
//   (toute autre valeur, variable absente ou vide → activée)
//
// ⚠️ Pourquoi ce choix (opt-OUT et non opt-IN) : la version précédente exigeait
// `NODE_ENV !== "production" && NEXT_PUBLIC_ENABLE_DEMO_DATA === "true"`. Sur un
// déploiement Vercel, `NODE_ENV` vaut TOUJOURS "production" : la condition était
// donc inconditionnellement fausse et les blocs « Données de démonstration » /
// « Historique des sauvegardes » disparaissaient du tableau de bord en production
// alors qu'ils sont indispensables à la recette. Inverser le défaut rend la
// disparition impossible, même si la variable d'environnement est absente du
// projet Vercel (ou mal orthographiée).
//
// La sécurité n'est PAS assurée par ce drapeau — elle est assurée par les gardes
// serveur de chaque action : session valide, `assertCanMutate`, rôle
// ADMIN / SUPER_ADMIN, confirmation mot-clé et sauvegarde automatique avant purge.
//
// NOTE : ce module est réservé au code SERVEUR (page + Server Actions). Il ne doit
// pas être importé par un composant client : la lecture de `process.env` y serait
// figée au build et le garde serveur perdrait toute valeur.

// ⚠️ Les fichiers « use server » ne peuvent exporter QUE des fonctions asynchrones :
// ce module partagé ne porte donc AUCUNE directive « use server ».
/** Message renvoyé lorsque la fonctionnalité a été explicitement désactivée. */
export const DEMO_FEATURE_DISABLED_MESSAGE =
  "Fonctionnalité de démonstration désactivée sur cette instance " +
  "(variable NEXT_PUBLIC_ENABLE_DEMO_DATA=false).";

/** Valeurs boolean-esque considérées comme une désactivation explicite. */
const DISABLED_VALUES: ReadonlyArray<string> = ["false", "0", "off", "no"];

/**
 * Indique si la carte « Données de démonstration » et ses Server Actions sont
 * autorisées sur cette instance.
 *
 * @returns `true` par défaut (développement ET production) ; `false` uniquement
 *          si `NEXT_PUBLIC_ENABLE_DEMO_DATA` vaut « false », « 0 », « off » ou
 *          « no » (insensible à la casse, espaces ignorés).
 */
export function isDemoDataFeatureEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_ENABLE_DEMO_DATA?.trim().toLowerCase();

  if (!raw) {
    // Variable absente ou vide : on reste permissif (aucune disparition du
    // tableau de bord en production, même sans configuration Vercel).
    return true;
  }

  return !DISABLED_VALUES.includes(raw);
}