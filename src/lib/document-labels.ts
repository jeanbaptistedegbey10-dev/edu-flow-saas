import type { DocumentType } from "@prisma/client";

// --------------------------------------
// Libellés & styles des types de documents
// --------------------------------------
//
// Conventions identiques à `payment-status.ts` / `student-status.ts` :
// map centralisée + fonctions accesseurs utilisées par toutes les vues.

/** Libellés FR affichables des types de pièces jointes. */
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  PASSPORT: "Passeport",
  IDENTITY: "Pièce d'identité",
  DIPLOMA: "Diplôme",
  OTHER: "Autre document",
};

/** Ordre d'affichage stable des types dans les formulaires. */
export const DOCUMENT_TYPES_ORDER: readonly DocumentType[] = [
  "PASSPORT",
  "IDENTITY",
  "DIPLOMA",
  "OTHER",
];

export function getDocumentTypeLabel(type: DocumentType): string {
  return DOCUMENT_TYPE_LABELS[type];
}

/** Pastilles colorées différenciant visuellement chaque catégorie. */
export function getDocumentTypeBadgeClass(type: DocumentType): string {
  switch (type) {
    case "PASSPORT":
      return "bg-indigo-500/10 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300";
    case "IDENTITY":
      return "bg-sky-500/10 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300";
    case "DIPLOMA":
      return "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}