"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { logAuditEvent } from "@/lib/actions/audit";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-constants";
import {
  BACKUP_REASONS,
  RESTORE_CONFIRM_WORD,
  type OrganizationBackupActionState,
  type OrganizationBackupDTO,
} from "@/lib/demo-data-constants";
import { assertCanMutate } from "@/lib/license-check";
import {
  createOrganizationBackup,
  deleteOrganizationBackup,
  listOrganizationBackups,
  restoreOrganizationBackup,
} from "@/lib/organization-backup";
import {
  getValidatedSessionContext,
  isNextRedirectError,
} from "@/lib/session";

// --------------------------------------
// Sauvegardes automatiques — Server Actions
// ----------------------------------
//
// ⚠️ Contrainte « use server » : ce module n'exporte QUE des fonctions
// asynchrones. Les valeurs partagées (constantes, types) vivent dans
// `@/lib/demo-data-constants`.
//
// Exposées au tableau de bord (carte « Données de démonstration ») :
// - `createOrganizationBackupAction` : snapshot manuel, à la demande ;
// - `listOrganizationBackupsAction`   : historique des sauvegardes ;
// - `restoreOrganizationBackupAction` : restauration d'un snapshot ;
// - `deleteOrganizationBackupAction`  : suppression d'une sauvegarde.
//
// La sauvegarde automatique AVANT purge est déclenchée en interne par les
// étapes de nettoyage de `src/lib/actions/demo-data.ts` : la suppression ne
// s'engage jamais « sans filet ».
//
// Sécurité : chaque action rejoue les mêmes gardes côté serveur — session
// valide, `assertCanMutate` (abonnement/essai actif), rôle ADMIN /
// SUPER_ADMIN et, pour la restauration, confirmation mot-clé. Une erreur de
// redirection (`NEXT_REDIRECT`) est TOUJOURS relancée, jamais convertie en
// état d'erreur métier.

/** Rôles autorisés à gérer les sauvegardes. */
const ADMIN_ROLES: ReadonlyArray<string> = ["ADMIN", "SUPER_ADMIN"];

/** Motifs enregistrés dans le journal d'audit (sauvegarde / restauration). */
const AUDIT_BACKUP_CREATED = AUDIT_ACTIONS.BACKUP_CREATED;
const AUDIT_BACKUP_RESTORED = AUDIT_ACTIONS.BACKUP_RESTORED;

/** Entité auditée pour les opérations de sauvegarde / restauration. */
const AUDIT_BACKUP_ENTITY = AUDIT_ENTITIES.ORGANIZATION_BACKUP;

/**
 * Contexte d'exécution commun à toutes les actions de sauvegarde :
 * session revalidée contre la base, garde d'écriture et rôle administrateur.
 *
 * `assertCanMutate` peut appeler `redirect()` (→ NEXT_REDIRECT) : l'erreur
 * est relancée par l'appelant, jamais convertie en état d'erreur métier.
 */
async function resolveBackupAdminContext(): Promise<
  | { ok: true; organizationId: string; userId: string }
  | { ok: false; state: OrganizationBackupActionState }
> {
  const session = await auth();
  if (!session?.user?.organizationId || !session?.user?.id) {
    return {
      ok: false,
      state: { status: "error", message: "Non autorisé ou organisation manquante." },
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

  if (!ADMIN_ROLES.includes(context.role)) {
    return {
      ok: false,
      state: {
        status: "error",
        message: "Cette action est réservée aux administrateurs.",
      },
    };
  }

  return {
    ok: true,
    organizationId: context.organizationId,
    userId: context.id,
  };
}

/** Traduit un motif d'échec de sauvegarde en message lisible par l'utilisateur. */
function describeCreateFailure(reason: string): string {
  switch (reason) {
    case "ORG_NOT_FOUND":
      return "Organisation introuvable. Veuillez réessayer.";
    case "TOO_LARGE":
      return (
        "Les données de l'organisation sont trop volumineuses pour une " +
        "sauvegarde automatique. Contactez le support avant de poursuivre."
      );
    default:
      return (
        "La sauvegarde automatique a échoué. L'opération a été interrompue " +
        "pour protéger vos données."
      );
  }
}

/** Traduit un motif d'échec de restauration en message lisible. */
function describeRestoreFailure(reason: string): string {
  switch (reason) {
    case "BACKUP_NOT_FOUND":
      return "Sauvegarde introuvable. Elle a peut-être été supprimée.";
    case "BACKUP_EXPIRED":
      return "Cette sauvegarde a expiré et n'est plus restaurable.";
    case "INVALID_PAYLOAD":
      return "Le contenu de cette sauvegarde est illisible. Restauration impossible.";
    case "SAFETY_BACKUP_FAILED":
      return (
        "Impossible de créer la sauvegarde de sécurité de l'état actuel. " +
        "La restauration a été interrompue pour ne rien perdre."
      );
    default:
      return "Une erreur est survenue lors de la restauration.";
  }
}

/**
 * Crée une sauvegarde manuelle de l'état courant de l'organisation.
 *
 * Utilisée par le bouton « Sauvegarder maintenant » de l'historique. Les
 * sauvegardes automatiques AVANT purge sont déclenchées en interne par les
 * étapes de nettoyage (cf. `src/lib/actions/demo-data.ts`).
 */
export async function createOrganizationBackupAction(): Promise<OrganizationBackupActionState> {
  try {
    const resolved = await resolveBackupAdminContext();
    if (!resolved.ok) return resolved.state;

    const result = await createOrganizationBackup(
      resolved.organizationId,
      resolved.userId,
      BACKUP_REASONS.MANUAL
    );

    if (!result.ok) {
      return { status: "error", message: describeCreateFailure(result.reason) };
    }

    await logAuditEvent({
      action: AUDIT_BACKUP_CREATED,
      entity: AUDIT_BACKUP_ENTITY,
      details: { rowCount: result.rowCount, sizeBytes: result.sizeBytes },
    });

    revalidatePath("/dashboard");

    return {
      status: "success",
      message: `Sauvegarde créée : ${result.rowCount} enregistrement(s) conservé(s).`,
      backups: await listOrganizationBackups(resolved.organizationId),
    };
  } catch (error: unknown) {
    if (isNextRedirectError(error)) throw error;

    console.error("[createOrganizationBackupAction] Échec :", error);
    return {
      status: "error",
      message: "Une erreur est survenue lors de la création de la sauvegarde.",
    };
  }
}

/** Récupère l'historique des sauvegardes de l'organisation active. */
export async function listOrganizationBackupsAction(): Promise<OrganizationBackupDTO[]> {
  const session = await auth();
  if (!session?.user?.organizationId) return [];

  const context = await getValidatedSessionContext();
  if (!context) return [];

  return listOrganizationBackups(context.organizationId);
}

/**
 * Restaure une sauvegarde dans l'organisation active.
 *
 * Garde-fous rejoués côté serveur :
 *   1. session + `assertCanMutate` (abonnement/essai actif) ;
 *   2. rôle ADMIN / SUPER_ADMIN ;
 *   3. confirmation mot-clé `RESTAURER` (le client seul n'est jamais
 *      suffisant) ;
 *   4. cloisonnement multi-tenant de la sauvegarde à l'organisation.
 *
 * La restauration écrase les données actuelles : une sauvegarde de sécurité
 * (motif « avant restauration ») est créée en amont par la couche métier, ce
 * qui rend l'opération elle-même réversible.
 */
export async function restoreOrganizationBackupAction(
  backupId: string,
  formData?: FormData
): Promise<OrganizationBackupActionState> {
  try {
    const resolved = await resolveBackupAdminContext();
    if (!resolved.ok) return resolved.state;

    // Confirmation mot-clé obligatoire, rejouée côté serveur.
    const confirmation = String(formData?.get("confirmation") ?? "")
      .trim()
      .toUpperCase();

    if (confirmation !== RESTORE_CONFIRM_WORD) {
      return {
        status: "error",
        message: `Confirmation incorrecte. Tapez ${RESTORE_CONFIRM_WORD} pour restaurer cette sauvegarde.`,
      };
    }

    if (!backupId || typeof backupId !== "string") {
      return { status: "error", message: "Sauvegarde non spécifiée." };
    }

    const result = await restoreOrganizationBackup(backupId, resolved.organizationId);

    if (!result.ok) {
      return { status: "error", message: describeRestoreFailure(result.reason) };
    }

    await logAuditEvent({
      action: AUDIT_BACKUP_RESTORED,
      entity: AUDIT_BACKUP_ENTITY,
      entityId: backupId,
      details: { rowCount: result.rowCount, tableCount: result.tableCount },
    });

    // Les écrans du tableau de bord dérivent tous des données restaurées.
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/students");
    revalidatePath("/dashboard/classes");
    revalidatePath("/dashboard/treasorerie");
    revalidatePath("/dashboard/payments");
    revalidatePath("/dashboard/attendance");
    revalidatePath("/dashboard/organization");

    return {
      status: "success",
      message: `Restauration terminée : ${result.rowCount} enregistrement(s) réinjecté(s) sur ${result.tableCount} table(s).`,
      backups: await listOrganizationBackups(resolved.organizationId),
    };
  } catch (error: unknown) {
    if (isNextRedirectError(error)) throw error;

    console.error("[restoreOrganizationBackupAction] Échec :", error);
    return {
      status: "error",
      message: "Une erreur est survenue lors de la restauration.",
    };
  }
}

/** Supprime une sauvegarde de l'historique (jamais une donnée métier). */
export async function deleteOrganizationBackupAction(
  backupId: string
): Promise<OrganizationBackupActionState> {
  try {
    const resolved = await resolveBackupAdminContext();
    if (!resolved.ok) return resolved.state;

    const deleted = await deleteOrganizationBackup(backupId, resolved.organizationId);

    if (!deleted) {
      return { status: "error", message: "Sauvegarde introuvable." };
    }

    revalidatePath("/dashboard");

    return {
      status: "success",
      message: "Sauvegarde supprimée de l'historique.",
      backups: await listOrganizationBackups(resolved.organizationId),
    };
  } catch (error: unknown) {
    if (isNextRedirectError(error)) throw error;

    console.error("[deleteOrganizationBackupAction] Échec :", error);
    return {
      status: "error",
      message: "Une erreur est survenue lors de la suppression.",
    };
  }
}
