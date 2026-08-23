/**
 * Utilitaires d'export de données au format CSV, compatibles Microsoft Excel.
 *
 * Points d'attention :
 * - Le fichier téléchargé est préfixé par le BOM UTF-8 (\uFEFF) : sans lui,
 *   Excel interprète mal l'encodage et affiche les caractères accentués
 *   (é, è, à…) sous forme de séquences corrompues.
 * - Le séparateur par défaut est « ; », attendu par Excel dans les locales
 *   utilisant la virgule décimale (France, Afrique francophone…).
 */

/**
 * Caractères de contrôle construits dynamiquement (retour chariot, saut de
 * ligne et séquence CRLF) afin de rester explicites et fiables dans le code.
 */
const CR = String.fromCharCode(13); // Retour chariot
const LF = String.fromCharCode(10); // Saut de ligne
const CRLF = `${CR}${LF}`;

/** Regex globale normalisant tout retour à la ligne (CRLF, CR ou LF) vers LF. */
const NEWLINE_REGEX = new RegExp(`${CR}?${LF}|${CR}`, "g");

/**
 * Définit une colonne du fichier CSV exporté.
 * `TRow` est le type des lignes exportées (ex : `StudentDTO`, `PaymentDTO`).
 */
export type CsvColumn<TRow> = {
  /** Libellé affiché en première ligne (en-têtes) du fichier. */
  header: string;
  /** Extrait la valeur brute de la cellule pour une ligne donnée. */
  value: (row: TRow) => string | number | null | undefined;
};

type CsvOptions = {
  /** Séparateur de champs (défaut : « ; » pour compatibilité Excel FR). */
  delimiter?: string;
};

/** Échappe une cellule selon la RFC 4180 (guillemets, séparateur, retours ligne). */
function escapeCsvCell(
  raw: string | number | null | undefined,
  delimiter: string
): string {
  if (raw === null || raw === undefined) {
    return "";
  }

  // Normalise les retours à la ligne pour ne pas casser l'enregistrement CSV.
  let cell = String(raw).replace(NEWLINE_REGEX, LF);

  const mustQuote =
    cell.includes(delimiter) || cell.includes('"') || cell.includes(LF);

  if (mustQuote) {
    // Un guillemet doublé (« "" ») est l'échappement standard du CSV.
    cell = `"${cell.replace(/"/g, '""')}"`;
  }

  return cell;
}

/**
 * Convertit un tableau de lignes en contenu CSV (sans BOM).
 * Les nombres restent non quotés afin qu'Excel les traite comme des valeurs
 * numériques exploitables (tri, sommes…).
 */
export function toCsvString<TRow>(
  rows: readonly TRow[],
  columns: readonly CsvColumn<TRow>[],
  options: CsvOptions = {}
): string {
  const delimiter = options.delimiter ?? ";";

  const lines: string[] = [
    columns
      .map((column) => escapeCsvCell(column.header, delimiter))
      .join(delimiter),
  ];

  for (const row of rows) {
    lines.push(
      columns
        .map((column) => escapeCsvCell(column.value(row), delimiter))
        .join(delimiter)
    );
  }

  return lines.join(CRLF);
}

/**
 * Déclenche le téléchargement d'un contenu CSV côté navigateur.
 * Le contenu est préfixé par le BOM UTF-8 (\uFEFF) requis par Microsoft Excel.
 */
export function downloadCsvFile(filename: string, csvContent: string): void {
  // \uFEFF : marque d'ordre des octets UTF-8, indispensable pour qu'Excel
  // détecte correctement l'encodage du fichier.
  const blob = new Blob([`\uFEFF${csvContent}`], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = filename.replace(/\.csv$/i, "");

  anchor.href = url;
  anchor.download = `${safeName}.csv`;
  anchor.style.display = "none";

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}

/**
 * Exporte directement des lignes typées vers un fichier CSV téléchargé.
 * À utiliser avec le tableau **déjà filtré** affiché à l'écran afin que
 * l'export reflète fidèlement les filtres actifs de l'utilisateur.
 */
export function exportToCsv<TRow>(
  filename: string,
  rows: readonly TRow[],
  columns: readonly CsvColumn<TRow>[],
  options: CsvOptions = {}
): void {
  downloadCsvFile(filename, toCsvString(rows, columns, options));
}