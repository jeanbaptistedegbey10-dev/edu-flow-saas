"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  getOrganizationDataPresence,
  injectDemoDataForOrganization,
  resetOrganizationData,
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
// - `resetDemoDataAction`   : supprime toutes les données métier (1 clic).
//
// Les deux actions sont protégées par `assertCanMutate` (session valide +
// abonnement/essai actif → sinon redirection /billing). La réinitialisation
// est en plus réservée aux administrateurs.

/** État sérialisable retourné aux composants clients (`useActionState`). */
export type DemoDataActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const INITIAL_ACTION_STATE: DemoDataActionState = { status: "idle" };

/** État initial partagé par les deux formulaires client. */
export { INITIAL_ACTION_STATE };

/**
 * Injecte le jeu de données de démonstration dans l'organisation courante.
 *
 * - Organisation VIDE : injection directe ;
 * - Organisation AVEC données : l'écrasement exige la saisie de « CONFIRMER »
 *   dans le champ `confirmation` — vérifiée CÔTÉ SERVEUR (le garde-fou ne
 *   dépend jamais du client seul). Une fois confirmée, l'organisation est
 *   purgée puis ré-injectée.
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
 * Réinitialise l'organisation en supprimant toutes les données de démonstration
 * (étudiants, cours, classes, paiements, dépenses, ventes…) en 1 clic.
 * Réservé aux administrateurs (ADMIN / SUPER_ADMIN). L'organisation et les
 * comptes administrateurs sont conservés.
 *
 * Deletion guard + confirmation mot-clé « SUPPRIMER » rejouées côté serveur :
 * aucune donnée → refus ; confirmation absente/incorrecte → refus.
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

    // 7. Opérations de données — encapsulées dans le même try/catch global.
    const result = await resetOrganizationData(context.organizationId);

    if (!result.ok) {
      return {
        status: "error",
        message: "La réinitialisation a échoué. Veuillez réessayer.",
      };
    }

    revalidatePath("/dashboard");

    return {
      status: "success",
      message: `Base réinitialisée : ${result.deleted.students} élèves, ${result.deleted.payments} paiements supprimés.`,
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
