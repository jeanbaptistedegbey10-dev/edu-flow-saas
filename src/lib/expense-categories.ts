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

/**
 * Catégories correspondant à un versement de salaire / rémunération d'un
 * membre de l'équipe. Pour ces catégories, le formulaire de dépense affiche
 * un menu déroulant permettant de désigner le bénéficiaire du versement.
 */
export const SALARY_CATEGORIES = ["Salaires"] as const;

/** Indique si la catégorie donnée est un versement de salaire / rémunération. */
export function isSalaryCategory(category: string): boolean {
  return (SALARY_CATEGORIES as readonly string[]).includes(category);
}