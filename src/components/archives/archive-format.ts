/** Format monetaire partage des archives (FCFA, fr-FR). */
export function formatArchiveAmount(value: number): string {
  return `${Math.round(value).toLocaleString("fr-FR")} FCFA`;
}
