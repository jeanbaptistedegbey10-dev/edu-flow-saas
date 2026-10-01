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
} from "@/lib/demo-data";
import {
  BACKUP_REASONS,
  type DemoDataActionState,
} from "@/lib/demo-data-constants";
import {
  DEMO_FEATURE_DISABLED_MESSAGE,
  isDemoDataFeatureEnabled,
} from "@/lib/demo-data-feature";
import { assertCanMutate } from "@/lib/license-check";
import { createOrganizationBackup } from "@/lib/organization-backup";
import {
  getValidatedSessionContext,
  isNextRedirectError,
} from "@/lib/session";

// --------------------------------------
// Données de démonstration — Server Actions
// --------------------------------------
//
// ⚠️ Contrainte « use server » : ce module n'exporte QUE des fonctions
// asynchrones. Les valeurs partagées (état initial, type d'état d'action)
// vivent dans `@/lib/demo-data-constants` — exporter une constante ou un
// objet depuis un fichier « use server » provoque une erreur de compilation
// Next.js (« Only async functions are allowed to be exported »).
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
//
// ---------------------------------------------------------------
// Sauvegarde automatique AVANT suppression (auto-backup)
// ---------------------------------------------------------------
// Aucune suppression ne s'engage « sans filet » : chaque point d'entrée de la
// purge (étape 1 du flux pas-à-pas, `resetDemoDataAction`,
// `injectDemoDataAction` en écrasement) crée d'abord un snapshot JSON complet
// via `ensurePrePurgeBackup`. Si la sauvegarde échoue, la suppression est
// REFUSÉE — mieux vaut interrompre l'opération que détruire des données sans
// possibilité de retour en arrière. L'historique est consultable et
// restaurable depuis le tableau de bord (« Historique des sauvegardes »).

// -----------------------------------------------------------------------
// Garde d'activation de la fonctionnalité de démonstration (côté serveur)
// -----------------------------------------------------------------------
// La règle vit désormais dans `@/lib/demo-data-feature` (SOURCE DE VÉRITÉ
// partagée avec l'affichage — `src/app/dashboard/page.tsx`) : la
// fonctionnalité est ACTIVE PAR DÉFAUT, y compris en production (opt-OUT).
// Seule une désactivation explicite (`NEXT_PUBLIC_ENABLE_DEMO_DATA=false`)
// la coupe. L'ancienne règle `NODE_ENV !== "production" && … === "true"`
// rendait la condition toujours fausse sur Vercel (NODE_ENV y vaut toujours
// « production ») : les actions étaient refusées alors même que la carte était
// censée y être disponible pour les administrateurs.
//
// Défense en profondeur : `isDemoDataFeatureEnabled()` rejoue ici la MÊME règle
// que l'UI — toute invocation directe des Server Actions (client obsolète,
// requête forgée) est refusée dès que l'instance a désactivé la fonctionnalité.
//
// La sécurité ne repose PAS sur ce drapeau : chaque action rejoue ses propres
// gardes (session, `assertCanMutate`, rôle ADMIN / SUPER_ADMIN, confirmation
// mot-clé, sauvegarde automatique avant purge).
//
// NOTE : le seeding à l'ONBOARDING (inscription avec jeu de démonstration)
// emprunte un chemin distinct (auth.ts / actions/register.ts) et n'est PAS
// concerné par ce garde.

/** Mots de confirmation reconnus par les étapes de nettoyage. */
type ResetConfirmationWord = "SUPPRIMER" | "CONFIRMER";

const ALLOWED_CONFIRMATION_WORDS: ReadonlyArray<ResetConfirmationWord> = [
  "SUPPRIMER",
  "CONFIRMER",
];

/**
 * Vérifications communes partagées par les trois étapes de nettoyage :
 *   1. fonctionnalité démo activée (opt-OUT : désactivée seulement si
 *      NEXT_PUBLIC_ENABLE_DEMO_DATA=false) ;
 *   2. session présente (organisation rattachée au JWT) ;
 *   3. garde d'écriture `assertCanMutate` (peut rediriger vers /billing) ;
 *   4. contexte de session revalidé contre la base (source de vérité) ;
 *   5. rôle administrateur (ADMIN / SUPER_ADMIN) requis ;
 *   6. confirmation mot-clé rejouée côté serveur (jamais client seul).
 */
async function resolveDemoMutationContext(
  formData?: FormData
): Promise<
  | { ok: true; organizationId: string }
  | { ok: false; state: DemoDataActionState }
> {
  // 0. Garde d'activation : refus immédiat si l'instance a explicitement
  //    désactivé la fonctionnalité (NEXT_PUBLIC_ENABLE_DEMO_DATA=false).
  if (!isDemoDataFeatureEnabled()) {
    return {
      ok: false,
      state: {
        status: "error",
        message: DEMO_FEATURE_DISABLED_MESSAGE,
      },
    };
  }

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
// ORDRE « Leaves to Root » : les dépendances (Task, Payment, Document…) sont
// supprimées EN PREMIER, puis les cours/évaluations, enfin les racines
// (étudiants, utilisateurs). Cet ordre évite les violations de contraintes
// foreign key (P2003/P2014), notamment Task.createdBy → User (onDelete: Restrict).

/**
 * Sauvegarde automatique AVANT suppression — garde-fou « sans filet ».
 *
 * Appelée par chaque point d'entrée de la suppression (étape 1 du flux
 * pas-à-pas, action monolithique `resetDemoDataAction`, écrasement par
 * `injectDemoDataAction`). Elle s'appuie sur un drapeau `backupCreated`
 * transmis dans le `FormData` : l'étape 1 crée réellement la sauvegarde, les
 * étapes 2 et 3 la réutilisent (une seule sauvegarde par flux, pas de doublon
 * à chaque étape).
 *
 * Si la sauvegarde échoue, la suppression est REFUSÉE : mieux vaut interrompre
 * une opération demandée par l'utilisateur que détruire des données sans
 * possibility de retour en arrière.
 *
 * Retourne `null` lorsque la suppression peut être engagée, sinon l'état
 * d'erreur à renvoyer au client.
 */
async function ensurePrePurgeBackup(
  organizationId: string,
  userId: string | null,
  formData?: FormData
): Promise<DemoDataActionState | null> {
  // Sauvegarde déjà réalisée pour ce flux (étapes 2 et 3) : on n'en crée pas
  // une seconde, ce qui saturerait l'historique de sauvegardes identiques.
  if (String(formData?.get("backupCreated") ?? "") === "1") {
    return null;
  }

  const result = await createOrganizationBackup(
    organizationId,
    userId,
    BACKUP_REASONS.AUTO_PURGE
  );

  if (!result.ok) {
    console.error(
      "[demo-data] Sauvegarde automatique refusée, suppression annulée :",
      result.reason
    );

    return {
      status: "error",
      message:
        result.reason === "TOO_LARGE"
          ? "Les données de l'organisation sont trop volumineuses pour une sauvegarde automatique. " +
            "Suppression annulée : contactez le support pour une restauration manuelle."
          : "La sauvegarde automatique a échoué : la suppression a été interrompue pour protéger vos données.",
    };
  }

  return null;
}

/**
 * ÉTAPE 1 — Dépendances & financier (Feuilles / Leaves).
 *
 * Requête courte (< 3 s, transaction Prisma bornée) et idempotente :
 * paiements, ventes POS, documents, salaires, dépenses, tâches, étapes voyage,
 * dossiers voyage & workflows, catalogue POS, comptes non-admin puis rôles.
 *
 * DOIT ÊTRE EXÉCUTÉ EN PREMIER : supprime les tâches (Task) avant les
 * utilisateurs (User) pour respecter la contrainte `onDelete: Restrict`.
 * C'est aussi le point d'entrée du flux de suppression : une sauvegarde
 * automatique y est créée AVANT toute écriture (cf. `ensurePrePurgeBackup`).
 * Vérifications serveur : session, garde d'écriture, rôle admin et
 * confirmation mot-clé (SUPPRIMER ou CONFIRMER selon le flux appelant).
 */
export async function resetFinancialStepAction(
  _prevState: DemoDataActionState,
  formData?: FormData
): Promise<DemoDataActionState> {
  try {
    const resolved = await resolveDemoMutationContext(formData);
    if (!resolved.ok) return resolved.state;

    // Sauvegarde automatique AVANT suppression (point d'entrée du flux).
    const backupError = await ensurePrePurgeBackup(
      resolved.organizationId,
      null,
      formData
    );
    if (backupError) return backupError;

    const counts = await resetFinancialAndSettingsData(
      resolved.organizationId
    );

    revalidatePath("/dashboard");

    return {
      status: "success",
      message: `Données financières et dépendances supprimées : ${counts.payments} paiements, ${counts.tasks} tâches.`,
      counts,
    };
  } catch (error: any) {
    if (isNextRedirectError(error)) throw error;

    console.error("[resetFinancialStepAction] Échec de l'étape 1 (dépendances/financier) :", error);
    return {
      status: "error",
      message:
        error?.message ||
        "Une erreur est survenue lors de la suppression des dépendances et données financières.",
    };
  }
}

/**
 * ÉTAPE 2 — Cours, évaluations et présences (Intermédiaires).
 *
 * Requête courte (< 3 s, transaction Prisma bornée) et idempotente :
 * présences, cahier de texte, sessions d'évaluation, classes puis cours.
 *
 * S'EXÉCUTE APRÈS les dépendances (Étape 1) et AVANT les racines (Étape 3).
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
      message: `Cours, évaluations et présences supprimés : ${counts.courses} cours, ${counts.classes} classes.`,
      counts,
    };
  } catch (error: any) {
    if (isNextRedirectError(error)) throw error;

    console.error("[resetCoursesStepAction] Échec de l'étape 2 (cours/évaluations) :", error);
    return {
      status: "error",
      message:
        error?.message ||
        "Une erreur est survenue lors de la suppression des cours, évaluations et présences.",
    };
  }
}

/**
 * ÉTAPE 3 — Étudiants & scolarité (Racines / Root records).
 *
 * Requête courte (< 3 s, transaction Prisma bornée) et idempotente : notes,
 * affectations de classes, inscriptions aux cours, logements, étudiants puis
 * parrainages.
 *
 * DOIT ÊTRE EXÉCUTÉ EN DERNIER : les étudiants sont référencés par de nombreuses
 * tables enfants qui doivent avoir été supprimées auparavant (Étapes 1 et 2).
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
      message: `Élèves et scolarité nettoyés : ${counts.students} élèves, ${counts.housings} logements.`,
      counts,
    };
  } catch (error: any) {
    if (isNextRedirectError(error)) throw error;

    console.error("[resetStudentsStepAction] Échec de l'étape 3 (étudiants/scolarité) :", error);
    return {
      status: "error",
      message:
        error?.message ||
        "Une erreur est survenue lors du nettoyage des étudiants et de la scolarité.",
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
    // 0. Garde d'activation : la fonctionnalité n'est refusée que si l'instance
    //    l'a explicitement désactivée (cf. isDemoDataFeatureEnabled).
    if (!isDemoDataFeatureEnabled()) {
      return {
        status: "error",
        message: DEMO_FEATURE_DISABLED_MESSAGE,
      };
    }

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
    //    La même sonde `presence` alimente ensuite l'optimisation anti-timeout.
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

      // 4b. Sauvegarde automatique AVANT l'écrasement : la démo va remplacer
      //     des données existantes, la suppression n'est jamais « sans filet ».
      //     En cas d'échec, l'injection est interrompue (rien n'est détruit).
      const backupError = await ensurePrePurgeBackup(
        context.organizationId,
        context.id,
        formData
      );
      if (backupError) return backupError;

      // 4c. Données résiduelles présentes : réinitialisation complète avant
      //     l'injection (« reset-before-inject » idempotent, sans échappatoire).
      const reset = await resetOrganizationData(context.organizationId);

      if (!reset.ok) {
        console.error(
          "[injectDemoDataAction] Réinitialisation préalable échouée :",
          reset.reason
        );
        return {
          status: "error",
          message:
            "Impossible de nettoyer les données existantes avant l'injection. Veuillez réessayer ou contacter le support.",
        };
      }
    }

    // 4d. OPTIMISATION ANTI-TIMEOUT : si l'organisation est DÉJÀ VIDE (cas
    //     nominal après le pas-à-pas de la carte, ou toute première injection),
    //     la réinitialisation complète est SKIPPÉE. Elle coûterait ~15
    //     allers-retours SQL dans la MÊME requête HTTP que l'injection et
    //     ferait dépasser le budget Serverless (10 s) — d'où les faux
    //     dialogs d'erreur Vercel alors que l'injection aurait pu réussir.

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
    // 0. Garde d'activation : la fonctionnalité n'est refusée que si l'instance
    //    l'a explicitement désactivée (cf. isDemoDataFeatureEnabled).
    if (!isDemoDataFeatureEnabled()) {
      return {
        status: "error",
        message: DEMO_FEATURE_DISABLED_MESSAGE,
      };
    }

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

    // 7. Sauvegarde automatique AVANT suppression (double confirmation
    //    déjà validée). Si la sauvegarde échoue, la suppression est
    //    interrompue : aucune donnée n'est détruite sans possibilité de
    //    restauration.
    const backupError = await ensurePrePurgeBackup(
      context.organizationId,
      context.id,
      formData
    );
    if (backupError) return backupError;

    // 8. Opérations de données — trois étapes EXÉCUTÉES SÉQUENTIELLEMENT
    //    (une requête HTTP par étape) dans l'ordre « Leaves to Root » :
    //      Étape 1 = dépendances/financier (Task, Payment, Document, User non-admin…)
    //      Étape 2 = cours, évaluations, présences, classes
    //      Étape 3 = étudiants, parrainages (racines)
    //    Cet ordre évite les violations de contraintes foreign key (P2003/P2014),
    //    notamment Task.createdBy → User (onDelete: Restrict).
    //    Chaque étape est entourée d'un try/catch qui retourne un état d'erreur
    //    explicite au lieu de propager une exception non gérée (Minified React error #441).
    let step1Result: Awaited<ReturnType<typeof resetFinancialAndSettingsData>>;
    let step2Result: Awaited<ReturnType<typeof resetCoursesAndAssessmentsData>>;
    let step3Result: Awaited<ReturnType<typeof resetStudentsAndSchoolingData>>;

    try {
      step1Result = await resetFinancialAndSettingsData(context.organizationId);
    } catch (error: unknown) {
      console.error("[resetDemoDataAction] Étape 1 (financier/dépendances) échouée :", error);
      return {
        status: "error",
        message:
          (error instanceof Error && error.message) ||
          "Échec de l'étape 1 (suppression des données financières et dépendances).",
      };
    }

    try {
      step2Result = await resetCoursesAndAssessmentsData(context.organizationId);
    } catch (error: unknown) {
      console.error("[resetDemoDataAction] Étape 2 (cours/évaluations) échouée :", error);
      return {
        status: "error",
        message:
          (error instanceof Error && error.message) ||
          "Échec de l'étape 2 (suppression des cours, évaluations et présences).",
      };
    }

    try {
      step3Result = await resetStudentsAndSchoolingData(context.organizationId);
    } catch (error: unknown) {
      console.error("[resetDemoDataAction] Étape 3 (étudiants/scolarité) échouée :", error);
      return {
        status: "error",
        message:
          (error instanceof Error && error.message) ||
          "Échec de l'étape 3 (suppression des étudiants et de la scolarité).",
      };
    }

    // Fusion des compteurs des trois étapes (toutes ont réussi).
    const counts = mergeResetCounts(step1Result, step2Result, step3Result);

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