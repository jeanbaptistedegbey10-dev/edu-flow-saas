// --------------------------------------
// Arborescence Google Drive générée automatiquement
// --------------------------------------
//
// EduFlow n'héberge aucun fichier : les pièces jointes vivent sur le
// stockage externe de l'établissement (Google Drive, OneDrive, DropBox…).
// Afin de garder un classement homogène, chaque document rattaché à un
// apprenant suit l'arborescence conventionnelle :
//
//   EduFlow / [Nom Prénom de l'apprenant] / [Nom du document]
//
// Ce module centralise la construction de ce chemin (affichage dans la
// modale d'ajout, copie dans le presse-papiers, guide de configuration) :
// un seul endroit à mettre à jour si la convention évolue.

/** Dossier racine réservé à EduFlow dans le Drive de l'établissement. */
export const DRIVE_ROOT_FOLDER_NAME = "EduFlow";

/**
 * Assainit un segment de chemin pour en faire un nom de dossier valide :
 * - les séparateurs `/` et `\` sont interdits dans un nom de dossier Drive
 *   et sont remplacés par un tiret ;
 * - les espaces multiples sont réduits ;
 * - un segment vide retombe sur une valeur de secours lisible.
 */
export function sanitizeDriveSegment(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[/\\]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

/**
 * Construit l'arborescence Drive conventionnelle d'un document :
 * `EduFlow / [Nom_Prénom_Apprenant] / [Nom_Document]`.
 *
 * Sans nom de propriétaire (document non rattaché à un apprenant), le
 * niveau intermédiaire est omis : `EduFlow / [Nom_Document]`.
 */
export function buildDriveFolderPath(input: {
  ownerName?: string | null;
  documentTitle: string;
}): string {
  const segments: string[] = [DRIVE_ROOT_FOLDER_NAME];

  const ownerName = input.ownerName?.trim();
  if (ownerName) {
    segments.push(sanitizeDriveSegment(ownerName, "Apprenant"));
  }

  segments.push(sanitizeDriveSegment(input.documentTitle, "Document"));

  return segments.join(" / ");
}