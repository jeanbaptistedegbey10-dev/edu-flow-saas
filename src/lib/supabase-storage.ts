import { createClient } from "@supabase/supabase-js";

// --------------------------------------
// Stockage Cloud externe (Supabase Storage)
// --------------------------------------
//
// Les fichiers ne transitent JAMAIS par le serveur web : le navigateur
// téléverse directement le fichier vers Supabase Storage et seul le lien
// public résultant est renvoyé pour être enregistré en base via la Server
// Action `addDocumentAction`.
//
// Variables requises (`.env`) :
//   - NEXT_PUBLIC_SUPABASE_URL
//   - NEXT_PUBLIC_SUPABASE_ANON_KEY (ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
//   - NEXT_PUBLIC_SUPABASE_DOCUMENTS_BUCKET (optionnel, défaut « documents »)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";
const DOCUMENTS_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_DOCUMENTS_BUCKET || "documents";

/** Taille maximale acceptée pour un téléversement (100 Mo). */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Types MIME acceptés : images, PDF, bureautique Office/OpenDocument, texte et archives. */
const ACCEPTED_MIME_PREFIXES = ["image/", "text/plain"];
const ACCEPTED_MIME_EXACT = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/zip",
];

export type StorageUploadResult = {
  /** Lien public direct du fichier téléversé. */
  url: string;
  /** Taille du fichier en octets. */
  size: number;
};

/** Indique si le stockage cloud est configuré dans l'environnement. */
export function isStorageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Assainit un nom de fichier pour un chemin de bucket sûr. */
function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(-80);
}

/**
 * Téléverse un fichier vers Supabase Storage depuis le navigateur et
 * retourne son lien public. Lève une erreur métier explicite en cas de
 * configuration manquante, de type/taille refusés ou d'échec réseau.
 */
export async function uploadDocumentFile(file: File): Promise<StorageUploadResult> {
  if (!isStorageConfigured()) {
    throw new Error(
      "Le stockage cloud n'est pas configuré. Collez plutôt un lien externe (Google Drive, Dropbox, OneDrive…) ou configurez Supabase Storage."
    );
  }

  if (file.size <= 0) {
    throw new Error("Le fichier sélectionné est vide.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Fichier trop volumineux (maximum : 100 Mo).");
  }

  const mimeOk =
    ACCEPTED_MIME_EXACT.includes(file.type) ||
    ACCEPTED_MIME_PREFIXES.some((prefix) => file.type.startsWith(prefix));

  if (!mimeOk) {
    throw new Error(
      "Type de fichier non pris en charge (acceptés : PDF, images, Word, Excel, PowerPoint, texte, ZIP)."
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const fileName = sanitizeFileName(file.name) || "document";
  const path = `${Date.now()}-${crypto.randomUUID()}-${fileName}`;

  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (error) {
    throw new Error(
      getErrorMessage(error, "Échec du téléversement vers le stockage cloud.")
    );
  }

  const { data } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new Error("Impossible d'obtenir le lien public du fichier.");
  }

  return { url: data.publicUrl, size: file.size };
}
