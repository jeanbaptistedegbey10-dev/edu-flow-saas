"use server";

import type { DocumentType } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentOrganizationId } from "@/lib/session";
import { assertCanMutate } from "@/lib/license-check";

// --------------------------------------
// Types publics (contrat avec les composants clients)
// --------------------------------------

/** Pièce jointe telle que consommée par les vues « Documents ». */
export type DocumentDTO = {
  id: string;
  title: string;
  type: DocumentType;
  /** Lien distant du fichier (Google Drive, Dropbox, Supabase Storage…). */
  fileUrl: string;
  /** Taille en octets (null pour un simple lien collé sans métadonnées). */
  fileSize: number | null;
  studentId: string | null;
  travelProcedureId: string | null;
  createdAt: Date;
};

/** Propriétaire d'une liste de documents : étudiant et/ou dossier voyage. */
export type DocumentsOwner = {
  studentId?: string | null;
  travelProcedureId?: string | null;
};

/** Résultat des mutations rapides (suppression) côté client. */
export type DocumentMutationResult =
  | { ok: true }
  | { ok: false; message: string };

export type DocumentFormField = "title" | "type" | "fileUrl";

export type DocumentFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Partial<Record<DocumentFormField, string>>;
};

// --------------------------------------
// Constantes & helpers internes
// --------------------------------------

const DOCUMENT_TYPES: readonly DocumentType[] = [
  "PASSPORT",
  "IDENTITY",
  "DIPLOMA",
  "OTHER",
];

const MAX_TITLE_LENGTH = 120;
/** Plafond raisonnable pour un lien collé (équivalent limite Navigateur). */
const MAX_URL_LENGTH = 2048;
/** Cohérent avec la limite appliquée côté téléversement (100 Mo). */
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/** Valide et normalise un lien distant : absolu et strictement http(s). */
function parseFileUrl(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}

/** Parse une taille en octets transmise par le formulaire d'upload cloud. */
function parseFileSize(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const size = Number(trimmed);
  if (!Number.isInteger(size) || size <= 0 || size > MAX_FILE_SIZE_BYTES) {
    return null;
  }

  return size;
}

/** Invalide les pages détail rattachées après toute mutation. */
function invalidatePaths(document: {
  studentId: string | null;
  travelProcedureId: string | null;
}) {
  if (document.studentId) {
    revalidatePath(`/dashboard/students/${document.studentId}`);
  }
  if (document.travelProcedureId) {
    revalidatePath(`/dashboard/travels/${document.travelProcedureId}`);
  }
}

// --------------------------------------
// Récupération (isolation multi-tenant)
// --------------------------------------

/**
 * Liste des pièces jointes rattachées à un étudiant et/ou à un dossier de
 * voyage, filtrées par l'organisation active (aucun croisement inter-tenant).
 */
export async function getDocumentsByOwner(
  owner: DocumentsOwner
): Promise<DocumentDTO[]> {
  const organizationId = await getCurrentOrganizationId();

  const studentId = owner.studentId ?? null;
  const travelProcedureId = owner.travelProcedureId ?? null;

  if (!studentId && !travelProcedureId) {
    return [];
  }

  const rows = await prisma.document.findMany({
    where: {
      organizationId,
      OR: [
        ...(studentId ? [{ studentId }] : []),
        ...(travelProcedureId ? [{ travelProcedureId }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      type: true,
      fileUrl: true,
      fileSize: true,
      studentId: true,
      travelProcedureId: true,
      createdAt: true,
    },
  });

  return rows;
}

// --------------------------------------
// Mutations
// --------------------------------------

/** Résultat d'échec homogène pour le formulaire d'ajout. */
function documentFailure(
  message: string,
  fieldErrors?: DocumentFormState["fieldErrors"]
): DocumentFormState {
  return fieldErrors
    ? { status: "error", message, fieldErrors }
    : { status: "error", message };
}

/**
 * Enregistre une nouvelle pièce jointe (titre, type, lien distant et
 * propriétaire). Le fichier lui-même vit sur un stockage externe : seule son
 * URL publique (Google Drive, Dropbox, Supabase Storage…) est persistée.
 *
 * Contrat d'usage : `useActionState(addDocumentAction, …)` — reçoit le
 * formulaire précédent + le FormData et renvoie un état affichable.
 */
export async function addDocumentAction(
  _prevState: DocumentFormState,
  formData: FormData
): Promise<DocumentFormState> {
  await assertCanMutate();
  const organizationId = await getCurrentOrganizationId();

  const title = String(formData.get("title") ?? "").trim();
  const rawType = String(formData.get("type") ?? "").trim();
  const studentId =
    formData.get("studentId")?.toString().trim() || null;
  const travelProcedureId =
    formData.get("travelProcedureId")?.toString().trim() || null;

  // Au moins un rattachement est obligatoire (étudiant ou dossier voyage).
  if (!studentId && !travelProcedureId) {
    return documentFailure(
      "Rattachez ce document à un étudiant ou à un dossier de voyage."
    );
  }

  const fieldErrors: DocumentFormState["fieldErrors"] = {};

  if (!title) {
    fieldErrors.title = "Le titre est obligatoire.";
  } else if (title.length > MAX_TITLE_LENGTH) {
    fieldErrors.title = `Le titre ne doit pas dépasser ${MAX_TITLE_LENGTH} caractères.`;
  }

  const fileUrl = parseFileUrl(formData.get("fileUrl")?.toString() ?? "");
  if (!fileUrl) {
    fieldErrors.fileUrl =
      "Lien invalide : collez une URL http(s) complète ou téléversez un fichier.";
  }

  // Métadonnée optionnelle fournie par l'upload cloud (ignorée si absurde).
  const fileSize = parseFileSize(
    formData.get("fileSize")?.toString() ?? ""
  );

  if (fieldErrors.title || fieldErrors.fileUrl || !fileUrl) {
    // `fileUrl` est garantie non nulle ici (le lien invalide a alimenté
    // `fieldErrors.fileUrl`) ; ce garde-fou affine le type pour Prisma.
    return documentFailure(
      "Veuillez corriger les champs signalés.",
      fieldErrors
    );
  }

  try {
    // Isolation multi-tenant : le propriétaire doit appartenir à
    // l'organisation active avant tout enregistrement.
    if (studentId) {
      const student = await prisma.student.findFirst({
        where: { id: studentId, organizationId },
        select: { id: true },
      });

      if (!student) {
        return documentFailure(
          "Étudiant introuvable dans votre organisation."
        );
      }
    }

    if (travelProcedureId) {
      const procedure = await prisma.travelProcedure.findFirst({
        where: { id: travelProcedureId, organizationId },
        select: { id: true },
      });

      if (!procedure) {
        return documentFailure(
          "Dossier de voyage introuvable dans votre organisation."
        );
      }
    }

    const created = await prisma.document.create({
      data: {
        organizationId,
        title,
        type: isDocumentType(rawType) ? rawType : "OTHER",
        fileUrl,
        fileSize,
        studentId,
        travelProcedureId,
      },
      select: { studentId: true, travelProcedureId: true },
    });

    invalidatePaths(created);

    return { status: "success", message: `« ${title} » a été ajouté.` };
  } catch (error) {
    console.error("[documents] Échec de l'enregistrement :", error);
    return documentFailure(
      "Une erreur est survenue lors de l'enregistrement du document."
    );
  }
}

/**
 * Supprime définitivement une pièce jointe appartenant à l'organisation
 * active (le fichier distant, lui, reste sur le stockage externe).
 */
export async function deleteDocumentAction(
  id: string
): Promise<DocumentMutationResult> {
  await assertCanMutate();
  const organizationId = await getCurrentOrganizationId();

  try {
    const document = await prisma.document.findFirst({
      where: { id, organizationId },
      select: { id: true, studentId: true, travelProcedureId: true },
    });

    if (!document) {
      return {
        ok: false,
        message: "Document introuvable dans votre organisation.",
      };
    }

    await prisma.document.delete({ where: { id: document.id } });
    invalidatePaths({
      studentId: document.studentId,
      travelProcedureId: document.travelProcedureId,
    });

    return { ok: true };
  } catch (error) {
    console.error("[documents] Échec de la suppression :", error);
    return {
      ok: false,
      message: "Une erreur est survenue lors de la suppression du document.",
    };
  }
}
