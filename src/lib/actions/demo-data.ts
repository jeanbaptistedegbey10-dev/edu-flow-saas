"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  getOrganizationDataPresence,
  injectDemoDataForOrganization,
  mergeResetCounts,
  resetCoursesAndAssessmentsData,
  resetFinancialAndSettingsData,
  resetOrganizationData,
  resetStudentsAndSchoolingData,
  type DemoDataResetCounts,
} from "@/lib/demo-data";
import { assertCanMutate } from "@/lib/license-check";
import {
  getValidatedSessionContext,
  isNextRedirectError,
} from "@/lib/session";

// --------------------------------------
// Données de démonstration — Server Actions
// --------------------------------------
//
// Exposées au tableau de bord (carte « Données de démonstration ») :
// - `injectDemoDataAction`  : injecte le jeu de démonstration (idempotent) ;
// - `resetDemoDataAction`   : supprime toutes les données métier (1 clic) —
//                             orchestration « tout en un » (compatibilité) ;
// - `resetStudentsStepAction`, `resetCoursesStepAction`,
//   `resetFinancialStepAction` : TROIS sous-actions courtes (< 3 s chacune)
//   exécutées SÉQUENTIELLEMENT par la carte pendant la modale de progression
//   (`await step1() → await step2() → await step3()`).
//
// ---------------------------------------------------------------
// Pourquoi ce découpage ? (crash Vercel par timeout corrigé)
// ---------------------------------------------------------------
// L'ancienne action monolithique supprimait TOUTES les tables dans une seule
// requête HTTP : sur une organisation volumineuse, elle dépassait le budget
// d'exécution Serverless et se terminait par un crash 504 / 500. Chaque
// sous-action ci-dessous est désormais UNE requête HTTP distincte : aucun
// chunk ne s'approche de la limite (< 3 s, dans une transaction Prisma
// bornée). Le client enchaîne les trois étapes et suit la progression en
// temps réel.
//
// Sécurité : chaque étape rejoue les mêmes gardes côté serveur — session
// valide, `assertCanMutate` (abonnement/essai actif → sinon redirection
// /billing), rôle ADMIN / SUPER_ADMIN et confirmation mot-clé (SUPPRIMER ou
// CONFIRMER). Une erreur de redirection (`NEXT_REDIRECT`) est TOUJOURS
// relancée, jamais convertie en état d'erreur métier.

/** État sérialisable retourné aux composants clients (`useActionState`). */
export type DemoDataActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Comptes supprimés (renseignés par les sous-actions en cas de succès). */
  counts?: DemoDataResetCounts;
};

const INITIAL_ACTION_STATE: DemoDataActionState = { status: "idle" };

/** État initial partagé par les formulaires client. */
export { INITIAL_ACTION_STATE };

/** Mots de confirmation reconnus par les étapes de nettoyage. */
type ResetConfirmationWord = "SUPPRIMER" | "CONFIRMER";

const ALLOWED_CONFIRMATION_WORDS: ReadonlyArray<ResetConfirmationWord> = [
  "SUPPRIMER",
  "CONFIRMER",
];

/**
 * Vérifications communes partagées par les trois étapes de nettoyage :
 *   1. session présente (organisation rattachée au JWT) ;
 *   2. garde d'écriture `assertCanMutate` (peut rediriger vers /billing) ;
 *   3. contexte de session revalidé contre la base (source de vérité) ;
 *   4. rôle administrateur (ADMIN / SUPER_ADMIN) requis ;
 *   5. confirmation mot-clé rejouée côté serveur (jamais client seul).
 */
async function resolveDemoMutationContext(
  formData?: FormData
): Promise<
  | { ok: true; organizationId: string }
  | { ok: false; state: DemoDataActionState }
> {
  const session = await auth();
  if (!session?.user?.organizationId || !session?.user?.id) {
    return {
      ok: false,
      state: {
        status: "error",
        message: "Non autorisé ou organisation manquante.",
      },
    };
  }

  // Peut lancer `redirect()` (→ NEXT_REDIRECT) : propagée par l'appelant.
  await assertCanMutate();

  const context = await getValidatedSessionContext();
  if (!context) {
    return {
      ok: false,
      state: {
        status: "error",
        message: "Session invalide. Veuillez vous reconnecter.",
      },
    };
  }

  if (context.role !== "ADMIN" && context.role !== "SUPER_ADMIN") {
    return {
      ok: false,
      state: {
        status: "error",
        message: "Cette action est réservée aux administrateurs.",
      },
    };
  }

  const confirmation = String(formData?.get("confirmation") ?? "")
    .trim()
    .toUpperCase();
  if (!(ALLOWED_CONFIRMATION_WORDS as readonly string[]).includes(confirmation)) {
    return {
      ok: false,
      state: {
        status: "error",
        message:
          "Confirmation incorrecte. Tapez SUPPRIMER ou CONFIRMER pour continuer.",
      },
    };
  }

  return { ok: true, organizationId: context.organizationId };
}

// ---------------------------------------------------------------------------
// Étapes de nettoyage pas-à-pas (une requête HTTP par étape)
// ---------------------------------------------------------------------------

/**
 * ÉTAPE 1 — Nettoyage des étudiants et de la scolarité.
 *
 * Requête courte (< 3 s, transaction Prisma bornée) et idempotente : notes,
 * affectations de classes, inscriptions aux cours, logements puis étudiants.
 * Vérifications serveur : session, garde d'écriture, rôle admin et
 * confirmation mot-clé (SUPPRIMER ou CONFIRMER selon le flux appelant).
 */
export async function resetStudentsStepAction(
  _prevState: DemoDataActionState,
  formData?: FormData
): Promise<DemoDataActionState> {
  try {
    const resolved = await resolveDemoMutationContext(formData);
    if (!resolved.ok) return resolved.state;

    const counts = await resetStudentsAndSchoolingData(
      resolved.organizationId
    );

    revalidatePath("/dashboard");

    return {
      status: "success",
      message: "Élèves et scolarité nettoyés.",
      counts,
    };
  } catch (error: any) {
    if (isNextRedirectError(error)) throw error;

    console.error("[resetStudentsStepAction] Échec de l'étape 1 :", error);
    return {
      status: "error",
      message:
        error?.message ||
        "Une erreur est survenue lors du nettoyage des étudiants et de la scolarité.",
    };
  }
}

/**
 * ÉTAPE 2 — Suppression des cours, évaluations et présences.
 *
 * Requête courte (< 3 s, transaction Prisma bornée) et idempotente :
 * présences, cahier de texte, sessions d'évaluation, classes puis cours.
 */
export async function resetCoursesStepAction(
  _prevState: DemoDataActionState,
  formData?: FormData
): Promise<DemoDataActionState> {
  try {
    const resolved = await resolveDemoMutationContext(formData);
    if (!resolved.ok) return resolved.state;

    const counts = await resetCoursesAndAssessmentsData(
      resolved.organizationId
    );

    revalidatePath("/dashboard");

    return {
      status: "success",
      message: "Cours, évaluations et présences supprimés.",
      counts,
    };
  } catch (error: any) {
    if (isNextRedirectError(error)) throw error;

    console.error("[resetCoursesStepAction] Échec de l'étape 2 :", error);
    return {
      status: "error",
      message:
        error?.message ||
        "Une erreur est survenue lors de la suppression des cours, évaluations et présences.",
    };
  }
}

/**
 * ÉTAPE 3 — Réinitialisation des données financières et paramètres.
 *
 * Requête courte (< 3 s, transaction Prisma bornée) et idempotente :
 * paiements, ventes POS, documents, salaires, dépenses, tâches, dossiers
 * voyage & workflows, catalogue POS, comptes non-admin puis rôles.
 */
export async function resetFinancialStepAction(
  _prevState: DemoDataActionState,
  formData?: FormData
): Promise<DemoDataActionState> {
  try {
    const resolved = await resolveDemoMutationContext(formData);
    if (!resolved.ok) return resolved.state;

    const counts = await resetFinancialAndSettingsData(
      resolved.organizationId
    );

    revalidatePath("/dashboard");

    return {
      status: "success",
      message: "Données financières et paramètres réinitialisés.",
      counts,
    };
  } catch (error: any) {
    if (isNextRedirectError(error)) throw error;

    console.error("[resetFinancialStepAction] Échec de l'étape 3 :", error);
    return {
      status: "error",
      message:
        error?.message ||
        "Une erreur est survenue lors de la réinitialisation des données financières et paramètres.",
    };
  }
}
/**
 * Injecte le jeu de données de démonstration dans l'organisation courante.
 *
 * - Organisation VIDE : injection directe (le seeding seul est rapide, une
 *   transaction unique < 3 s) ;
 * - Organisation AVEC données : l'écrasement exige la saisie de « CONFIRMER »
 *   dans le champ `confirmation` — vérifiée CÔTÉ SERVEUR (le garde-fou ne
 *   dépend jamais du client seul). Une fois confirmée, l'organisation est
 *   purgée puis ré-injectée.
 *
 * NOTE (anti-timeout) : depuis le découpage pas-à-pas, la carte « Données de
 * démonstration » n'appelle PLUS cette action pour l'écrasement : elle purge
 * d'abord l'organisation via les trois sous-actions courtes (étapes 1 à 3,
 * une requête HTTP chacune), puis invoque cette action qui ne fait plus que
 * le seeding (organisation vide → chemin rapide). Le chemin « écrasement »
 * ci-dessous reste disponible pour tout appel direct (compatibilité).
 */
export async function injectDemoDataAction(
  _prevState: DemoDataActionState,
  formData?: FormData
): Promise<DemoDataActionState> {
  console.log("[demo-data] injectDemoDataAction — début");

  try {
    // 1. Vérification explicite de la session au tout début : si l'utilisateur
    //    n'est pas authentifié ou son organisation est absente du JWT, on
    //    retourne un état d'erreur plutôt que de laisser `redirect()` lever
    //    une exception non gérée (`NEXT_REDIRECT`) qui planterait la page.
    const session = await auth();
    if (!session?.user?.organizationId || !session?.user?.id) {
      return {
        status: "error",
        message: "Non autorisé ou organisation manquante.",
      };
    }

    // 2. Garde d'écriture : session valide + abonnement/essai actif.
    //    `assertCanMutate` peut appeler `redirect()` (→ NEXT_REDIRECT).
    await assertCanMutate();

    // 3. Contexte de session validé contre la base (source de vérité).
    const context = await getValidatedSessionContext();

    if (!context) {
      return {
        status: "error",
        message: "Session invalide. Veuillez vous reconnecter.",
      };
    }

    // 4. ÉCRASEMENT CONFIRMÉ : si l'organisation contient déjà des données,
    //    l'injection les remplace. Une confirmation mot-clé (CONFIRMER) est
    //    exigée côté serveur — le garde-fou ne repose jamais sur le seul client.
    const presence = await getOrganizationDataPresence(context.organizationId);

    if (presence.hasData) {
      const confirmation = String(
        formData?.get("confirmation") ?? ""
      ).trim();

      if (confirmation !== "CONFIRMER") {
        return {
          status: "error",
          message:
            "Votre organisation contient déjà des données. Tapez CONFIRMER pour les remplacer par le jeu de démonstration (écrasement définitif).",
        };
      }

      const reset = await resetOrganizationData(context.organizationId);

      if (!reset.ok) {
        console.error(
          "[injectDemoDataAction] Écrasement préalable refusé :",
          reset.reason
        );
        return {
          status: "error",
          message:
            "Impossible d'écraser les données existantes. Veuillez réessayer.",
        };
      }
    }

    // 5. Opérations de données — encapsulées dans le même try/catch global.
    const result = await injectDemoDataForOrganization(
      context.organizationId,
      context.id
    );

    if (!result.seeded) {
      revalidatePath("/dashboard");
      return result.reason === "ALREADY_SEEDED"
        ? {
            status: "error",
            message:
              "Votre organisation contient déjà des données. Réinitialisez d'abord si vous souhaitez repartir de zéro.",
          }
        : {
            status: "error",
            message: "Organisation introuvable. Veuillez réessayer.",
          };
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/students");
    revalidatePath("/dashboard/classes");
    revalidatePath("/dashboard/tresorerie");

    return {
      status: "success",
      message: `Jeu de démonstration injecté : ${result.counts.students} élèves, ${result.counts.classes} classes, ${result.counts.payments} paiements, ${result.counts.sales} ventes POS, ${result.counts.attendances} présences, ${result.counts.travelProcedures} dossiers voyage.`,
    };
  } catch (error: any) {
    // Relance les erreurs de redirection (NEXT_REDIRECT) pour que Next.js
    // les transforme en réponse HTTP de redirection — jamais les convertir
    // en état d'erreur métier.
    if (isNextRedirectError(error)) throw error;

    console.error("[injectDemoDataAction] Échec de l'injection :", error);
    return {
      status: "error",
      message:
        error?.message ||
        "Une erreur est survenue lors de l'injection de la démo.",
    };
  }
}
/**
 * RÉINITIALISE l'organisation en supprimant toutes les données de
 * démonstration (étudiants, cours, classes, paiements, dépenses, ventes…)
 * en 1 clic. RÉSERVÉ aux administrateurs (ADMIN / SUPER_ADMIN).
 * L'organisation et les comptes administrateurs sont conservés.
 *
 * Deletion guard + confirmation mot-clé « SUPPRIMER » rejouées côté serveur :
 * aucune donnée → refus ; confirmation absente/incorrecte → refus.
 *
 * NOTE (anti-timeout) : la carte « Données de démonstration » n'utilise plus
 * cette action monolithique mais les TROIS sous-actions courtes
 * (`resetStudentsStepAction` → `resetCoursesStepAction` →
 * `resetFinancialStepAction`), exécutées séquentiellement (une requête HTTP
 * chacune). Cette action reste l'orchestration « tout en un » (compatibilité) :
 * elle délègue aux mêmes trois étapes transactionnées.
 */
export async function resetDemoDataAction(
  _prevState: DemoDataActionState,
  formData?: FormData
): Promise<DemoDataActionState> {
  console.log("[demo-data] resetDemoDataAction — début");

  try {
    // 1. Vérification explicite de la session au tout début : si l'utilisateur
    //    n'est pas authentifié ou son organisation est absente du JWT, on
    //    retourne un état d'erreur plutôt que de laisser `redirect()` lever
    //    une exception non gérée (`NEXT_REDIRECT`) qui planterait la page.
    const session = await auth();
    if (!session?.user?.organizationId || !session?.user?.id) {
      return {
        status: "error",
        message: "Non autorisé ou organisation manquante.",
      };
    }

    // 2. Garde d'écriture : session valide + abonnement/essai actif.
    //    `assertCanMutate` peut appeler `redirect()` (NEXT_REDIRECT).
    await assertCanMutate();

    // 3. Contexte de session validé contre la base (source de vérité).
    const context = await getValidatedSessionContext();

    if (!context) {
      return {
        status: "error",
        message: "Session invalide. Veuillez vous reconnecter.",
      };
    }

    // 4. La réinitialisation est réservée aux administrateurs de l'établissement.
    if (context.role !== "ADMIN" && context.role !== "SUPER_ADMIN") {
      return {
        status: "error",
        message: "Cette action est réservée aux administrateurs.",
      };
    }

    // 5. Deletion guard : aucune donnée → on refuse (bouton désactivé côté UI,
    //    mais la garde est rejouée côté serveur pour couvrir tout appel direct).
    const presence = await getOrganizationDataPresence(context.organizationId);

    if (!presence.hasData) {
      return {
        status: "error",
        message:
          "Aucune donnée à supprimer : votre organisation est déjà vide.",
      };
    }

    // 6. Confirmation mot-clé obligatoire (SUPPRIMER) côté serveur.
    const confirmation = String(formData?.get("confirmation") ?? "").trim();

    if (confirmation !== "SUPPRIMER") {
      return {
        status: "error",
        message:
          "Confirmation incorrecte. Tapez SUPPRIMER pour supprimer définitivement toutes les données.",
      };
    }

    // 7. Opérations de données — trois étapes courtes (transactions bornées),
    //    exécutées EN PARALLÈLE pour minimiser le temps total d'exécution (anti-timeout).
    const [step1, step2, step3] = await Promise.all([
      resetStudentsAndSchoolingData(context.organizationId),
      resetCoursesAndAssessmentsData(context.organizationId),
      resetFinancialAndSettingsData(context.organizationId),
    ]);

    // Chaque étape est transactionnelle et idempotente ; on fusionne les compteurs.
    // Si une étape lève une exception, elle remontera au try/catch global de l'action.
    const counts = mergeResetCounts(step1, step2, step3);

    revalidatePath("/dashboard");

    return {
      status: "success",
      message: `Base réinitialisée : ${counts.students} élèves, ${counts.payments} paiements supprimés.`,
    };
  } catch (error: any) {
    // Relance les erreurs de redirection (NEXT_REDIRECT) pour que Next.js
    // les transforme en réponse HTTP de redirection — jamais les convertir
    // en état d'erreur métier.
    if (isNextRedirectError(error)) throw error;

    console.error(
      "[resetDemoDataAction] Échec de la réinitialisation :",
      error
    );
    return {
      status: "error",
      message:
        error?.message ||
        "Une erreur est survenue lors de la réinitialisation.",
    };
  }
}