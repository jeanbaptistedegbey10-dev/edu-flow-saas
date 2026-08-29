"use server";

import { revalidatePath } from "next/cache";

import {
  injectDemoDataForOrganization,
  resetOrganizationData,
} from "@/lib/demo-data";
import { assertCanMutate } from "@/lib/license-check";
import { getValidatedSessionContext } from "@/lib/session";

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
 * Idempotent : retourne `ALREADY_SEEDED` si des données existent déjà.
 */
export async function injectDemoDataAction(
  _prevState: DemoDataActionState
): Promise<DemoDataActionState> {
  // Garde d'écriture : session valide + abonnement/essai actif.
  await assertCanMutate();

  const context = await getValidatedSessionContext();

  if (!context) {
    return {
      status: "error",
      message: "Session invalide. Veuillez vous reconnecter.",
    };
  }

  try {
    const result = await injectDemoDataForOrganization(
      context.organizationId,
      context.id
    );

    revalidatePath("/dashboard");

    if (!result.seeded) {
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

    return {
      status: "success",
      message: `Jeu de démonstration injecté : ${result.counts.students} élèves, ${result.counts.courses} cours, ${result.counts.payments} reçus de paiement.`,
    };
  } catch (error) {
    console.error("[injectDemoDataAction] Échec de l'injection :", error);
    return {
      status: "error",
      message: "Une erreur est survenue lors de l'injection de la démo.",
    };
  }
}

/**
 * Réinitialise l'organisation en supprimant toutes les données de démonstration
 * (étudiants, cours, classes, paiements, dépenses, ventes…) en 1 clic.
 * Réservé aux administrateurs (ADMIN / SUPER_ADMIN). L'organisation et les
 * comptes administrateurs sont conservés.
 */
export async function resetDemoDataAction(
  _prevState: DemoDataActionState
): Promise<DemoDataActionState> {
  // Garde d'écriture : session valide + abonnement/essai actif.
  await assertCanMutate();

  const context = await getValidatedSessionContext();

  if (!context) {
    return {
      status: "error",
      message: "Session invalide. Veuillez vous reconnecter.",
    };
  }

  // La réinitialisation est réservée aux administrateurs de l'établissement.
  if (context.role !== "ADMIN" && context.role !== "SUPER_ADMIN") {
    return {
      status: "error",
      message: "Cette action est réservée aux administrateurs.",
    };
  }

  try {
    const result = await resetOrganizationData(context.organizationId);

    revalidatePath("/dashboard");

    if (!result.ok) {
      return {
        status: "error",
        message: "La réinitialisation a échoué. Veuillez réessayer.",
      };
    }

    return {
      status: "success",
      message: `Base réinitialisée : ${result.deleted.students} élèves, ${result.deleted.payments} paiements supprimés.`,
    };
  } catch (error) {
    console.error("[resetDemoDataAction] Échec de la réinitialisation :", error);
    return {
      status: "error",
      message: "Une erreur est survenue lors de la réinitialisation.",
    };
  }
}