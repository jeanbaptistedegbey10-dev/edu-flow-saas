// --------------------------------------
// Libellés & formatage du journal d'audit
// --------------------------------------
//
// SOURCE UNIQUE de vérité pour l'affichage du journal d'audit :
//   - `AUDIT_ACTION_LABELS` : clé d'action brute → libellé FRANÇAIS ;
//   - `AUDIT_ENTITY_LABELS` : entité technique → libellé FRANÇAIS ;
//   - `formatAuditDetails`  : payload `details` → paires label/valeur lisibles.
//
// Le dictionnaire des actions est typé `satisfies Record<AuditEntity…>` pour
// les entités et `Record<AuditAction, string>` pour les actions : toute nouvelle
// action ajoutée à `AUDIT_ACTIONS` SANS libellé français provoque une ERREUR DE
// COMPILATION — impossible d'oublier une traduction.
//
// Module SANS « use server », SANS dépendance serveur (utilisable côté client
// comme côté serveur) — cf. `@/lib/audit-constants` pour la même raison.

import type { AuditAction, AuditEntity } from "@/lib/audit-constants";
import {
  AUDIT_REDACTED_PLACEHOLDER,
  sanitizeAuditDetails,
} from "@/lib/audit-sanitize";
import { CLASS_STATUS_LABELS } from "@/lib/class-status";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/payment-status";
import { STUDENT_STATUS_LABELS } from "@/lib/student-status";
import { formatXOF } from "@/lib/plan-pricing";

// --------------------------------------
// 1. Libellés des actions
// --------------------------------------

/**
 * Libellés français de TOUTES les actions d'audit.
 *
 * Le typage `Record<AuditAction, string>` est délibéré : `satisfies` impose que
 * chaque clé de `AUDIT_ACTIONS` soit couverte — l'ajout d'une action sans
 * traduction fait échouer `tsc`.
 */
export const AUDIT_ACTION_LABELS = {
  STUDENT_CREATED: "Étudiant créé",
  STUDENT_UPDATED: "Étudiant modifié",
  STUDENT_DELETED: "Étudiant supprimé",
  STUDENTS_IMPORTED: "Import d'étudiants (CSV)",
  PAYMENT_RECEIVED: "Paiement reçu",
  PAYMENT_UPDATED: "Paiement modifié",
  PAYMENT_DELETED: "Paiement supprimé",
  PAYMENT_VOIDED: "Paiement annulé",
  SALE_CREATED: "Vente POS enregistrée",
  CASH_OPENED: "Caisse ouverte",
  CASH_CLOSED: "Caisse clôturée",
  CERTIFICATE_ISSUED: "Certificat émis",
  CERTIFICATE_REVOKED: "Certificat révoqué",
  DEMO_RESET: "Démo réinitialisée",
  DEMO_SEEDED: "Jeu de démonstration créé",
  BACKUP_CREATED: "Sauvegarde créée",
  BACKUP_RESTORED: "Sauvegarde restaurée",
  SETTINGS_UPDATED: "Paramètres modifiés",
  CLASS_STARTED: "Classe démarrée",
  CLASS_CLOSED: "Classe clôturée",
  CLASS_ARCHIVED: "Classe archivée",
  CLASS_UNARCHIVED: "Classe désarchivée",
  CLASS_REOPENED: "Classe rouverte",
  SESSION_STARTED: "Séance démarrée",
  SESSION_ENDED: "Séance terminée",
  ROLE_CREATED: "Rôle créé",
  ROLE_UPDATED: "Rôle modifié",
  ROLE_DELETED: "Rôle supprimé",
  USER_CREATED: "Utilisateur créé",
  USER_UPDATED: "Utilisateur modifié",
  USER_DELETED: "Utilisateur supprimé",
  // Alias historique (entrées enregistrées avant l'harmonisation) : conservé
  // pour que les anciennes lignes du journal restent lisibles.
  STUDENTS_IMPORT: "Import d'étudiants (CSV)",
} satisfies Record<AuditAction | "STUDENTS_IMPORT", string>;

/** Libellé français d'une action d'audit (jamais la clé brute). */
export function getAuditActionLabel(action: string): string {
  return (
    AUDIT_ACTION_LABELS[action as keyof typeof AUDIT_ACTION_LABELS] ??
    humanizeKey(action)
  );
}

// --------------------------------------
// 2. Libellés des entités
// --------------------------------------

/** Libellés français des entités auditées (`Student` → « Étudiant »…). */
export const AUDIT_ENTITY_LABELS = {
  Student: "Étudiant",
  Payment: "Paiement",
  Sale: "Vente comptoir",
  CashRegisterSession: "Séance de caisse",
  Certificate: "Certificat",
  Organization: "Organisation",
  User: "Utilisateur",
  CustomRole: "Rôle personnalisé",
  Class: "Classe",
  Demo: "Démonstration",
  OrganizationBackup: "Sauvegarde",
} satisfies Record<AuditEntity, string>;

/** Libellé français d'une entité auditée (jamais le nom de modèle brut). */
export function getAuditEntityLabel(entity: string): string {
  return (
    AUDIT_ENTITY_LABELS[entity as keyof typeof AUDIT_ENTITY_LABELS] ??
    humanizeKey(entity)
  );
}

// --------------------------------------
// 3. Badge de criticité
// --------------------------------------

/** Catégories d'actions pour le badge de couleur. */
export type AuditActionCategory =
  | "creation"
  | "modification"
  | "deletion"
  | "other";

/**
 * Catégorise une action pour la couleur de son badge.
 *
 * L'ordre des tests est important : `CLASS_UNARCHIVED` contient « ARCHIVED » et
 * `CLASS_REOPENED` contient « OPENED » — les actions inverses (désarchivage,
 * réouverture) sont des MODIFICATIONS, pas des suppressions.
 */
export function getAuditActionCategory(action: string): AuditActionCategory {
  if (action.includes("UNARCHIVED") || action.includes("REOPENED")) {
    return "modification";
  }
  if (
    action.includes("CREATED") ||
    action.includes("ISSUED") ||
    action.includes("SEEDED")
  ) {
    return "creation";
  }
  if (
    action.includes("UPDATED") ||
    action.includes("OPENED") ||
    action.includes("RECEIVED") ||
    action.includes("STARTED") ||
    action.includes("ENDED") ||
    action.includes("IMPORTED") ||
    action.includes("IMPORT") ||
    // Restauration d'une sauvegarde : réécriture de l'état de l'organisation,
    // ni création ni suppression au sens du journal.
    action.includes("RESTORED")
  ) {
    return "modification";
  }
  if (
    action.includes("DELETED") ||
    action.includes("REVOKED") ||
    action.includes("CLOSED") ||
    action.includes("ARCHIVED") ||
    action.includes("RESET") ||
    action.includes("VOIDED")
  ) {
    return "deletion";
  }
  return "other";
}

/** Classes Tailwind du badge de l'action (colorées par criticité). */
export function getAuditActionBadgeClass(action: string): string {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";
  switch (getAuditActionCategory(action)) {
    case "creation":
      return `${base} border border-emerald-200/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400`;
    case "modification":
      return `${base} border border-sky-200/60 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400`;
    case "deletion":
      return `${base} border border-red-200/60 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400`;
    default:
      return `${base} border border-slate-200/60 bg-slate-50 text-slate-700 dark:border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400`;
  }
}

// --------------------------------------
// 4. Formatage du champ « Détails »
// --------------------------------------

/** Une ligne « libellé / valeur » prête à afficher dans la modale. */
export type AuditDetailEntry = {
  /** Clé brute du payload (stable : sert de `key` React et de trace). */
  key: string;
  /** Libellé français du champ. */
  label: string;
  /** Valeur déjà formatée et traduite en français. */
  value: string;
};

/** Clés dont la valeur est un montant en FCFA. */
const MONEY_KEYS: readonly string[] = [
  "amount",
  "totalAmount",
  "netAmount",
  "discount",
  "initialAmount",
  "countedAmount",
  "gapAmount",
  "chargedReRegistrationFee",
];

/** Libellés des types de client (POS). */
const CLIENT_KIND_LABELS: Record<string, string> = {
  WALK_IN: "Client de passage",
  STUDENT: "Étudiant inscrit",
  TRAVEL_CANDIDATE: "Candidat voyage",
};

/** Libellés des pseudo-actions métier stockées dans `details.action`. */
const DETAIL_ACTION_LABELS: Record<string, string> = {
  RE_ENROLLMENT: "Réinscription",
};

/** Libellés des origines d'import. */
const SOURCE_LABELS: Record<string, string> = {
  csv_import: "Import CSV",
};

/** Libellés français des champs de `details` (hors montants / compteurs). */
const DETAIL_LABELS: Record<string, string> = {
  className: "Classe",
  newClassName: "Nouvelle classe",
  targetClassName: "Classe de passage",
  repeatTargetClassName: "Classe de redoublement",
  previousStatus: "Statut précédent",
  newStatus: "Nouveau statut",
  reopenedStatus: "Statut rétabli",
  method: "Moyen de paiement",
  paymentMethod: "Moyen de paiement",
  isOutOfSystem: "Écriture hors système",
  clientKind: "Type de client",
  clientName: "Client",
  studentCode: "Code étudiant",
  studentName: "Étudiant",
  firstName: "Prénom",
  lastName: "Nom",
  email: "E-mail",
  name: "Élève",
  source: "Origine",
  level: "Niveau",
  score: "Score",
  reason: "Motif",
  // Montants (MONEY_KEYS) — sans libellé, ils seraient affichés « Amount ».
  amount: "Montant",
  totalAmount: "Montant total",
  netAmount: "Montant net",
  discount: "Remise",
  initialAmount: "Fonds de caisse initial",
  countedAmount: "Montant compté",
  gapAmount: "Écart de caisse",
  chargedReRegistrationFee: "Frais de réinscription",
  // Acteurs (identifiants internes masqués à l'affichage).
  createdByUserId: "Utilisateur",
  createdByUserName: "Enregistré par",
  createdByUserRole: "Rôle de l'auteur",
  openedBy: "Ouverte par",
  closedBy: "Clôturée par",
  sessionId: "Séance",
  count: "Nombre d'émargements",
  itemCount: "Nombre d'articles",
  quantity: "Quantité totale",
  promoted: "Élèves admis",
  retained: "Élèves redoublants",
  dropped: "Élèves abandons",
  reassigned: "Élèves réaffectés",
  certificatesGenerated: "Certificats générés",
  bulletinsFinalized: "Bulletins finalisés",
  reactivatedEnrollments: "Inscriptions réactivées",
};

/**
 * Surcharges de libellé par action — la clé `details.status` désigne selon les
 * cas le statut d'un PAIEMENT ou celui d'un ÉTUDIANT : on le précise
 * explicitement plutôt que d'afficher un « Statut » ambigu.
 */
const DETAIL_LABELS_BY_ACTION: Record<string, Record<string, string>> = {
  PAYMENT_RECEIVED: { status: "Statut du paiement" },
  PAYMENT_UPDATED: { status: "Statut du paiement" },
  PAYMENT_VOIDED: { status: "Statut du paiement" },
  STUDENT_CREATED: { status: "Statut de l'étudiant" },
  STUDENT_UPDATED: { status: "Statut de l'étudiant" },
  STUDENT_DELETED: { status: "Statut de l'étudiant" },
};

 /**
 * Masque un identifiant technique interne (cuid) : seuls les 6 premiers
 * caractères sont conservés pour garder la traçabilité sans exposer
 * l'identifiant complet dans l'interface.
 */
export function maskInternalId(value: string): string {
  if (value.length <= 6) return `${value}…`;
  return `${value.slice(0, 6)}…`;
}

/** Repli lisible pour une clé non cataloguée (« someRawKey » → « Some raw key »). */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
  if (spaced.length === 0) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Formate un nombre en milliers séparés (fr-FR). */
const numberFormatter = new Intl.NumberFormat("fr-FR");

function formatEnumValue(value: string, labels: Record<string, string>): string {
  return labels[value] ?? humanizeKey(value);
}

/**
 * Traduit un statut selon l'entité concernée : la clé `details.status` désigne
 * un paiement (PAYMENT_* / SALE_*), un étudiant (STUDENT_*) ou, à défaut, un
 * statut de classe.
 */
function resolveStatusLabel(value: string, action: string): string {
  if (action.startsWith("PAYMENT_") || action.startsWith("SALE_")) {
    return formatEnumValue(value, PAYMENT_STATUS_LABELS);
  }
  if (action.startsWith("STUDENT")) {
    return formatEnumValue(value, STUDENT_STATUS_LABELS);
  }
  return formatEnumValue(value, CLASS_STATUS_LABELS);
}

function formatDetailValue(key: string, value: unknown, action: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (value === AUDIT_REDACTED_PLACEHOLDER) return AUDIT_REDACTED_PLACEHOLDER;

  if (typeof value === "boolean") return value ? "Oui" : "Non";

  if (typeof value === "number") {
    return MONEY_KEYS.includes(key)
      ? formatXOF(value)
      : numberFormatter.format(value);
  }

  if (typeof value === "string") {
    if (MONEY_KEYS.includes(key)) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? formatXOF(parsed) : value;
    }

    switch (key) {
      case "action":
        return DETAIL_ACTION_LABELS[value] ?? humanizeKey(value);
      case "source":
        return SOURCE_LABELS[value] ?? humanizeKey(value);
      case "clientKind":
        return formatEnumValue(value, CLIENT_KIND_LABELS);
      case "method":
      case "paymentMethod":
        return formatEnumValue(value, PAYMENT_METHOD_LABELS);
      case "previousStatus":
      case "newStatus":
      case "reopenedStatus":
        return formatEnumValue(value, CLASS_STATUS_LABELS);
      case "status":
        return resolveStatusLabel(value, action);
      default:
        break;
    }

    // Identifiants techniques internes (cuid) : masqués, jamais affichés en
    // clair dans le journal d'audit.
    if (key.endsWith("Id") || key.endsWith("By")) return maskInternalId(value);

    return value;
  }

  // Tableau / objet : résumé lisible, jamais de JSON brut à l'écran.
  if (Array.isArray(value)) {
    return `${value.length} élément${value.length > 1 ? "s" : ""}`;
  }

  if (typeof value === "object") {
    const fields = Object.keys(value as Record<string, unknown>).length;
    return `${fields} donnée${fields > 1 ? "s" : ""} associée${fields > 1 ? "s" : ""}`;
  }

  return "—";
}

/**
 * Traduit le champ `details` d'une entrée d'audit en paires
 * libellé/valeur LISIBLES (aucune clé technique, aucun JSON brut).
 *
 * Le payload est re-sanitisé à la lecture : les lignes enregistrées avant
 * l'introduction de `@/lib/audit-sanitize` sont ainsi affichées sans donnée
 * sensible (défense en profondeur).
 *
 * Renvoie un tableau vide si l'entrée ne porte aucun détail exploitable —
 * l'interface affiche alors « — ».
 */
export function formatAuditDetails(
  details: unknown,
  action = ""
): AuditDetailEntry[] {
  const sanitized = sanitizeAuditDetails(details);
  if (!sanitized) return [];

  const overrides = DETAIL_LABELS_BY_ACTION[action] ?? {};

  return Object.entries(sanitized).map(([key, value]) => ({
    key,
    label: overrides[key] ?? DETAIL_LABELS[key] ?? humanizeKey(key),
    value: formatDetailValue(key, value, action),
  }));
}

/**
 * Résumé textuel court du champ `details`, affiché dans la cellule du tableau
 * (le détail complet reste accessible via la modale « Voir détails »).
 *
 * Exemple : « Classe : Classe A Archiver · Montant : 50 000 FCFA ».
 */
export function summarizeAuditDetails(
  details: unknown,
  action = "",
  maxEntries = 2
): string {
  const entries = formatAuditDetails(details, action);
  if (entries.length === 0) return "";

  return entries
    .slice(0, maxEntries)
    .map((entry) => `${entry.label} : ${entry.value}`)
    .join(" · ");
}
