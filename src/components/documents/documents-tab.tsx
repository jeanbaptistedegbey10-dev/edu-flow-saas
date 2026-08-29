"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  CreditCardIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GraduationCapIcon,
  Loader2Icon,
  PaperclipIcon,
  PlaneTakeoffIcon,
  PlusIcon,
  Trash2Icon,
  UploadCloudIcon,
} from "lucide-react";

import {
  addDocumentAction,
  deleteDocumentAction,
  type DocumentDTO,
  type DocumentFormState,
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
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DOCUMENT_TYPES_ORDER,
} from "@/lib/document-labels";
import { uploadDocumentFile } from "@/lib/supabase-storage";
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

const INITIAL_FORM_STATE: DocumentFormState = { status: "idle" };

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

/** Convertit une erreur inconnue en message utilisateur. */
function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Une erreur inattendue est survenue.";
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

// --------------------------------------
// Modale d'ajout : lien collé OU fichier vers stockage cloud
// --------------------------------------

type AddMode = "link" | "upload";

/**
 * Formulaire d'ajout proprement dit. Remonté à chaque ouverture de la
 * modale (clé `formKey`) afin de repartir d'un état vierge, y compris après
 * un succès.
 */
function AddDocumentForm({
  owner,
  onCreated,
}: {
  owner: DocumentsOwner;
  onCreated: () => void;
}) {
  const [state, formAction, isPending] = React.useActionState(
    addDocumentAction,
    INITIAL_FORM_STATE
  );

  const [mode, setMode] = React.useState<AddMode>("link");
  const [isUploading, setIsUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [uploaded, setUploaded] = React.useState<{
    url: string;
    size: number;
    name: string;
  } | null>(null);

  React.useEffect(() => {
    if (state.status === "success") {
      onCreated();
    }
  }, [state, onCreated]);

  /** Téléverse directement le fichier vers le stockage cloud (hors serveur web). */
  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    setIsUploading(true);
    setUploadError(null);
    setUploaded(null);

    try {
      const result = await uploadDocumentFile(file);
      setUploaded({ url: result.url, size: result.size, name: file.name });
    } catch (error) {
      setUploadError(toErrorMessage(error));
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="studentId" value={owner.studentId ?? ""} />
      <input
        type="hidden"
        name="travelProcedureId"
        value={owner.travelProcedureId ?? ""}
      />

      {mode === "upload" && uploaded ? (
        <>
          <input type="hidden" name="fileUrl" value={uploaded.url} />
          <input type="hidden" name="fileSize" value={String(uploaded.size)} />
        </>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="document-title">Titre du document</Label>
        <Input
          id="document-title"
          name="title"
          placeholder="Passeport, Acte de naissance, Bulletin A1…"
          maxLength={120}
          required
          autoFocus
          aria-invalid={state.fieldErrors?.title ? true : undefined}
        />
        <FieldError message={state.fieldErrors?.title} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="document-type">Type de pièce</Label>
        <Select name="type" defaultValue="OTHER">
          <SelectTrigger id="document-type" className="w-full">
            <SelectValue placeholder="Choisir un type" />
          </SelectTrigger>
          <SelectContent>
            {DOCUMENT_TYPES_ORDER.map((value) => (
              <SelectItem key={value} value={value}>
                {getDocumentTypeLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <fieldset className="grid gap-2 rounded-md border border-slate-200/80 p-3 dark:border-slate-800">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          Source du fichier (stockage externe, jamais sur le serveur web)
        </legend>

        {/* Sélecteur de mode : lien collé / téléversement cloud */}
        <div className="flex gap-1 rounded-md bg-muted/60 p-1">
          <Button
            type="button"
            variant="pill"
            size="sm"
            className="flex-1"
            aria-pressed={mode === "link"}
            onClick={() => setMode("link")}
          >
            <PaperclipIcon className="size-4" />
            Coller un lien
          </Button>
          <Button
            type="button"
            variant="pill"
            size="sm"
            className="flex-1"
            aria-pressed={mode === "upload"}
            onClick={() => setMode("upload")}
          >
            <UploadCloudIcon className="size-4" />
            Téléverser un fichier
          </Button>
        </div>

        {mode === "link" ? (
          <div className="grid gap-2">
            <Input
              name="fileUrl"
              type="url"
              placeholder="https://drive.google.com/file/d/…"
              autoComplete="url"
              required
              aria-invalid={state.fieldErrors?.fileUrl ? true : undefined}
            />
            <p className="text-xs text-muted-foreground">
              Collez un lien direct Google Drive, Dropbox, OneDrive… Pensez à
              régler le partage sur « quiconque dispose du lien ».
            </p>
            <FieldError message={state.fieldErrors?.fileUrl} />
          </div>
        ) : (
          <div className="grid gap-2">
            {uploaded ? (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-500/10">
                <span className="block font-medium">{uploaded.name}</span>
                <span className="text-muted-foreground">
                  Téléversé vers le stockage cloud ·{" "}
                  {formatFileSize(uploaded.size)}
                </span>
              </p>
            ) : (
              <Input
                type="file"
                onChange={handleFileChange}
                disabled={isUploading}
                aria-label="Fichier à téléverser vers le stockage cloud"
              />
            )}

            {isUploading ? (
              <p
                role="status"
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2Icon className="size-4 animate-spin" />
                Téléversement vers le stockage cloud en cours…
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                PDF, images, Office, texte ou ZIP · 100 Mo maximum. Le fichier
                part directement du navigateur vers Supabase Storage ; seul le
                lien obtenu est enregistré.
              </p>
            )}

            <FieldError message={uploadError ?? state.fieldErrors?.fileUrl} />
          </div>
        )}
      </fieldset>

      {state.status === "error" && state.message ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Annuler
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isPending || isUploading}>
          {isPending || isUploading ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <PaperclipIcon className="size-4" />
          )}
          Enregistrer le document
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Bouton [➕ Ajouter un document] et modale de création associée. */
function AddDocumentDialog({ owner }: { owner: DocumentsOwner }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  // Remonte le formulaire vierge à chaque nouvelle ouverture.
  const [formKey, setFormKey] = React.useState(0);

  const handleCreated = React.useCallback(() => {
    setOpen(false);
    // La Server Action a déjà invalidé la page : réconciliation immédiate.
    router.refresh();
  }, [router]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setFormKey((key) => key + 1);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon className="size-4" />
          Ajouter un document
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un document</DialogTitle>
          <DialogDescription>
            Joignez une pièce officielle à ce dossier : collez simplement un
            lien de partage ou téléversez le fichier vers votre espace de
            stockage cloud.
          </DialogDescription>
        </DialogHeader>

        <AddDocumentForm key={formKey} owner={owner} onCreated={handleCreated} />
      </DialogContent>
    </Dialog>
  );
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
}: {
  owner: DocumentsOwner;
  initialDocuments: DocumentDTO[];
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

        <AddDocumentDialog owner={owner} />
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
            de naissance, un diplôme… via lien externe ou stockage cloud.
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
    </section>
  );
}