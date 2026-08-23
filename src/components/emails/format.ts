/**
 * Utilitaires de formatage partagés par les templates d'e-mails.
 * Les clients mail ne supportant pas CSS moderne, le formatage se fait côté données.
 */

/**
 * Formate un montant en francs CFA (XOF).
 * Exemple : 25000 → « 25 000 FCFA »
 */
export function formatFcfa(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
}

/**
 * Formate une date au format long français.
 * Exemple : 23 août 2026
 */
export function formatDateLong(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}