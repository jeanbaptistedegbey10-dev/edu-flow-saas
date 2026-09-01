"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CreditCardIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GraduationCapIcon,
  Loader2Icon,
  PaperclipIcon,
  PlaneTakeoffIcon,
  Trash2Icon,
} from "lucide-react";

import {
  deleteDocumentAction,
  type DocumentDTO,
  type DocumentsOwner,
} from "@/actions/documents";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AddDocumentModal } from "@/components/documents/add-document-modal";
import { GoogleDriveGuideModal } from "@/components/documents/google-drive-guide-modal";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getDocumentTypeBadgeClass,
  getDocumentTypeLabel,
} from "@/lib/document-labels";
import { cn } from "@/lib/utils";

// --------------------------------------
// Helpers d'affichage
// --------------------------------------

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation entre serveur et client.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/** Taille affichable (Ko / Mo) depuis un nombre d'octets. */
function formatFileSize(size: number | null): string {
  if (size === null || size <= 0) return "—";

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} Ko`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

/** Icône représentative selon la catégorie de pièce jointe. */
function DocumentTypeIcon({
  type,
  className,
}: {
  type: DocumentDTO["type"];
  className?: string;
}) {
  switch (type) {
    case "PASSPORT":
      return <PlaneTakeoffIcon className={className} />;
    case "IDENTITY":
      return <CreditCardIcon className={className} />;
    case "DIPLOMA":
      return <GraduationCapIcon className={className} />;
    default:
      return <FileTextIcon className={className} />;
  }
}

// --------------------------------------
// Onglet principal
// --------------------------------------

/** Pastille « type » avec son icône représentative. */
function DocumentTypeBadge({ type }: { type: DocumentDTO["type"] }) {
  return (
    <span className={cn(BADGE_BASE_CLASSES, getDocumentTypeBadgeClass(type))}>
      <DocumentTypeIcon type={type} className="size-3" />
      {getDocumentTypeLabel(type)}
    </span>
  );
}

/**
 * Composant « Documents & Pièces Jointes », partagé par la fiche étudiant et
 * le dossier voyage. Les données initiales sont chargées côté serveur (props) ;
 * toute mutation est réalisée par Server Action isolée multi-tenant, qui
 * invalide la page de détail avant que `router.refresh()` ne réconcilie le
 * tableau affiché.
 */
export function DocumentsTab({
  owner,
  initialDocuments,
  studentName,
}: {
  owner: DocumentsOwner;
  initialDocuments: DocumentDTO[];
  /**
   * Nom complet de l'apprenant / du candidat (ex : « Dupont Jean ») alimentant
   * l'arborescence Drive générée dans la modale d'ajout :
   * `EduFlow / [Nom_Prénom_Apprenant] / [Nom_Document]`.
   */
  studentName?: string | null;
}) {
  const router = useRouter();
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<string | null>(null);

  /** Confirmation de suppression → Server Action → rafraîchissement RSC. */
  async function handleConfirmDelete() {
    const documentId = confirmId;

    if (!documentId) return;

    setDeletingId(documentId);
    setRowError(null);

    try {
      const result = await deleteDocumentAction(documentId);

      if (!result.ok) {
        setRowError(result.message);
        return;
      }

      setConfirmId(null);
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  const pendingTitle =
    initialDocuments.find((document) => document.id === confirmId)?.title ?? "";

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-3 md:px-5 dark:border-slate-800">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <PaperclipIcon className="size-4" />
            Documents &amp; pièces jointes
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {initialDocuments.length} pièce
            {initialDocuments.length > 1 ? "s" : ""} · fichiers conservés sur un
            stockage externe (Drive, cloud), hors serveur web.
          </p>
        </div>

        <AddDocumentModal owner={owner} ownerName={studentName} />
      </div>

      {rowError ? (
        <p
          role="alert"
          className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive md:px-5"
        >
          {rowError}
        </p>
      ) : null}

      {initialDocuments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <PaperclipIcon className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Aucun document</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Utilisez « Ajouter un document » pour joindre un passeport, un acte
            de naissance, un diplôme… via un lien public Google Drive, OneDrive
            ou DropBox.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Document</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Taille</TableHead>
                <TableHead>Ajouté le</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialDocuments.map((document) => (
                <TableRow key={document.id}>
                  <TableCell>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        <DocumentTypeIcon
                          type={document.type}
                          className="size-4 text-muted-foreground"
                        />
                      </span>
                      <span
                        className="truncate font-medium"
                        title={document.title}
                      >
                        {document.title}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <DocumentTypeBadge type={document.type} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    {formatFileSize(document.fileSize)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {dateFormatter.format(document.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {/* Ouvre l'URL distante dans un nouvel onglet. */}
                      <a
                        href={document.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Visualiser « ${document.title} »`}
                        aria-label={`Visualiser « ${document.title} »`}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "icon" }),
                          "size-8 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <ExternalLinkIcon className="size-4" />
                      </a>
                      <a
                        href={document.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Télécharger « ${document.title} »`}
                        aria-label={`Télécharger « ${document.title} »`}
                        className={cn(
                          buttonVariants({ variant: "ghost", size: "icon" }),
                          "size-8 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <DownloadIcon className="size-4" />
                      </a>

                      <AlertDialog
                        open={confirmId === document.id}
                        onOpenChange={(nextOpen) =>
                          setConfirmId(nextOpen ? document.id : null)
                        }
                      >
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={deletingId === document.id}
                            title={`Supprimer « ${document.title} »`}
                            aria-label={`Supprimer « ${document.title} »`}
                            className="size-8 text-red-600 hover:text-red-700 dark:text-red-400"
                          >
                            {deletingId === document.id ? (
                              <Loader2Icon className="size-4 animate-spin" />
                            ) : (
                              <Trash2Icon className="size-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Supprimer ce document ?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              La pièce « {pendingTitle} » sera retirée
                              définitivement de cette fiche. Le fichier
                              original, lui, reste à son emplacement sur le
                              stockage externe.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel
                              disabled={deletingId === document.id}
                            >
                              Annuler
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={(event) => {
                                // Empêche la fermeture automatique : la
                                // modale ne se referme qu'en cas de succès.
                                event.preventDefault();
                                void handleConfirmDelete();
                              }}
                            >
                              Supprimer
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Texte explicatif : stockage externe & conservation gratuite (Drive). */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 px-4 py-3 md:px-5 dark:border-slate-800">
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Stockage externe :</span>{" "}
          EduFlow n&apos;héberge aucun fichier. Chaque pièce jointe est
          conservée sur votre propre espace — Google Drive (15 Go gratuits),
          OneDrive ou DropBox — et seul son lien public est enregistré ici.
          Vos documents restent disponibles en permanence, sans aucun coût de
          stockage supplémentaire, même en cas de résiliation de
          l&apos;abonnement.
        </p>
        <GoogleDriveGuideModal variant="outline" size="xs" />
      </div>
    </section>
  );
}
