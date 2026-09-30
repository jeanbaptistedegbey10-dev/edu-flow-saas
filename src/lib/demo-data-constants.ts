// --------------------------------------
// Données de démonstration — constantes partagées
// --------------------------------------
//
// ⚠️ Ce fichier NE doit PAS contenir de directive « use server » : il expose
// des valeurs non-fonctions (type + objet) consommées par les composants
// clients et par `src/lib/actions/demo-data.ts`. Les fichiers « use server »
// n'ont le droit d'exporter QUE des fonctions asynchrones — toute constante
// ou type partagé doit vivre ici (ou dans un module similaire hors actions).

import type { DemoDataResetCounts } from "@/lib/demo-data";

/** État sérialisable retourné aux composants clients (`useActionState`). */
export type DemoDataActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Comptes supprimés (renseignés par les sous-actions en cas de succès). */
  counts?: DemoDataResetCounts;
};

/** État initial partagé par les formulaires client. */
export const INITIAL_ACTION_STATE: DemoDataActionState = { status: "idle" };

// -----------------------------------------------------------------------
// Sauvegardes automatiques (Auto-Backup / Restore)
// -----------------------------------------------------------------------
// ⚠️ Module SANS « use server » : les Server Actions ne peuvent exporter que
// des fonctions asynchrones. Les constantes et types partagés par
// `src/lib/actions/organization-backup.ts` ET par les composants clients
// vivent donc ici.

/**
 * Durée de conservation par défaut d'une sauvegarde (jours).
 * Une sauvegarde expirée est purgée automatiquement de l'historique.
 */
export const BACKUP_RETENTION_DAYS = 14;

/** Motifs possibles d'une sauvegarde. */
export const BACKUP_REASONS = {
  /** Sauvegarde automatique effectuée avant une purge / réinitialisation. */
  AUTO_PURGE: "AUTO_PURGE",
  /** Garde-fou : sauvegarde de l'état courant avant une restauration. */
  AUTO_RESTORE: "AUTO_RESTORE",
  /** Sauvegarde déclenchée manuellement par un administrateur. */
  MANUAL: "MANUAL",
} as const;

export type BackupReason = (typeof BACKUP_REASONS)[keyof typeof BACKUP_REASONS];

/** Libellés lisibles des motifs de sauvegarde (affichage dans l'historique). */
export const BACKUP_REASON_LABELS: Record<BackupReason, string> = {
  AUTO_PURGE: "Automatique (avant suppression)",
  AUTO_RESTORE: "Automatique (avant restauration)",
  MANUAL: "Manuelle",
};

/** Version du format de snapshot écrite dans le JSON. */
export const BACKUP_SCHEMA_VERSION = 1;

/**
 * Mot de confirmation exigé pour déclencher une RESTAURATION depuis
 * l'interface. La suppression utilise déjà « SUPPRIMER » (cf. carte démo) :
 * un mot distinct évite toute confusion entre les deux opérations
 * irréversibles.
 */
export const RESTORE_CONFIRM_WORD = "RESTAURER";

/** Ligne d'historique d'une sauvegarde, telle qu'affichée dans l'UI. */
export type OrganizationBackupDTO = {
  id: string;
  backupName: string;
  reason: BackupReason | string;
  /** Poids du snapshot, formaté pour l'affichage (ex : « 1,2 Mo »). */
  sizeLabel: string;
  /** Nombre de lignes sauvegardées. */
  rowCount: number;
  createdAt: string;
  expiresAt: string;
  /** `true` si la sauvegarde a dépassé sa date d'expiration. */
  isExpired: boolean;
  /** `true` s'il reste moins de 48 h avant expiration (avertissement UI). */
  isExpiringSoon: boolean;
  /** Nombre de jours restants avant purge automatique (0 si expirée). */
  daysUntilExpiry: number;
};

/** État sérialisable des Server Actions de sauvegarde / restauration. */
export type OrganizationBackupActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** Historique rafraîchi après une création / restauration / suppression. */
  backups?: OrganizationBackupDTO[];
};
