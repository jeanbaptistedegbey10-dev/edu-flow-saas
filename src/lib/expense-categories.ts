/**
 * Catégories de dépenses proposées par défaut dans les formulaires.
 *
 * Placée dans `src/lib` (et non dans un fichier `"use server"`) car
 * Next.js interdit l'export de valeurs non-fonctions depuis un module
 * Server Actions : cette constante est consommée directement par des
 * composants clients.
 */
export const EXPENSE_CATEGORIES = [
  "Loyer",
  "Salaires",
  "Électricité",
  "Internet",
  "Fournitures",
  "Marketing",
  "Transport",
  "Équipement",
  "Autre",
] as const;

/** Type union des catégories valides (dérivé de la liste). */
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];