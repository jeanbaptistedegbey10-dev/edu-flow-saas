"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  CopyIcon,
  FolderTreeIcon,
  Loader2Icon,
  PaperclipIcon,
  PlusIcon,
} from "lucide-react";

import {
  addDocumentAction,
  type DocumentFormState,
  type DocumentsOwner,
} from "@/actions/documents";
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
import {
  GoogleDriveGuideModal,
} from "@/components/documents/google-drive-guide-modal";
import { Button } from "@/components/ui/button";
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
  DOCUMENT_TYPES_ORDER,
  getDocumentTypeLabel,
} from "@/lib/document-labels";
import { buildDriveFolderPath } from "@/lib/drive-folder";

// --------------------------------------
// Modale d'ajout de document (lien public uniquement)
// --------------------------------------
//
// Le téléversement direct de fichiers a été retiré : EduFlow n'héberge
// aucun fichier sur son serveur web. La seule source acceptée est un lien
// public collé (Google Drive, OneDrive, DropBox…), conservé gratuitement
// sur le stockage externe de l'établissement. Lorsque le document est
// rattaché à un apprenant, l'arborescence Drive conventionnelle
// `EduFlow / [Nom_Prénom_Apprenant] / [Nom_Document]` est générée
// automatiquement pour guider le classement côté Drive.

const INITIAL_FORM_STATE: DocumentFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/**
 * Formulaire d'ajout proprement dit. Remonté à chaque ouverture de la
 * modale (clé `formKey`) afin de repartir d'un état vierge, y compris après
 * un succès.
 */
function AddDocumentForm({
  owner,
  ownerName,
  onCreated,
}: {
  owner: DocumentsOwner;
  /** Nom complet du propriétaire (ex : « Dupont Jean ») ou null. */
  ownerName: string | null;
  onCreated: () => void;
}) {
  const [state, formAction, isPending] = React.useActionState(
    addDocumentAction,
    INITIAL_FORM_STATE
  );

  const [title, setTitle] = React.useState("");
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (state.status === "success") {
      onCreated();
    }
  }, [state, onCreated]);

  const trimmedOwnerName = ownerName?.trim() ?? "";
  const drivePath = buildDriveFolderPath({
    ownerName: trimmedOwnerName || null,
    documentTitle: title.trim() || "Nom du document",
  });

  /** Copie l'arborescence générée dans le presse-papiers. */
  async function handleCopyPath() {
    try {
      await navigator.clipboard.writeText(drivePath);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé…) : silencieux.
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

      <div className="grid gap-2">
        <Label htmlFor="document-title">Titre du document</Label>
        <Input
          id="document-title"
          name="title"
          placeholder="Passeport, Acte de naissance, Bulletin A1…"
          maxLength={120}
          required
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
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
      {/* Arborescence Drive générée automatiquement (si apprenant rattaché). */}
      {trimmedOwnerName ? (
        <div className="grid gap-1.5 rounded-md border border-dashed border-slate-300 bg-muted/40 p-3 dark:border-slate-700">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FolderTreeIcon className="size-3.5" />
            Arborescence Google Drive générée automatiquement
          </p>
          <code
            className="block truncate rounded bg-background px-2 py-1.5 text-xs"
            title={drivePath}
          >
            {drivePath}
          </code>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={handleCopyPath}
            >
              {copied ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <CopyIcon data-icon="inline-start" />
              )}
              {copied ? "Copié !" : "Copier l'arborescence"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Créez ces dossiers dans votre Google Drive (gratuit), rangez-y le
            fichier, puis collez ci-dessous son lien de partage. Ce chemin est
            reconstruit automatiquement pour chaque document de l&apos;apprenant.
          </p>
        </div>
      ) : null}

      <fieldset className="grid gap-2 rounded-md border border-slate-200/80 p-3 dark:border-slate-800">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          Source du fichier (stockage externe — jamais sur le serveur web)
        </legend>

        {/* Lien public collé : seule source acceptée (aucun téléversement). */}
        <div className="grid gap-2">
          <Label htmlFor="document-file-url" className="sr-only">
            Lien public du fichier
          </Label>
          <Input
            id="document-file-url"
            name="fileUrl"
            type="url"
            placeholder="https://drive.google.com/file/d/…"
            autoComplete="url"
            required
            aria-invalid={state.fieldErrors?.fileUrl ? true : undefined}
          />
          <p className="text-xs text-muted-foreground">
            Collez un lien public depuis Google Drive, OneDrive ou DropBox.
            Pensez à régler le partage sur « Quiconque dispose du lien ».
          </p>
          <FieldError message={state.fieldErrors?.fileUrl} />
        </div>

        {/* Guide gratuit : clé API Google Drive / Picker API, pas à pas. */}
        <div className="flex justify-start">
          <GoogleDriveGuideModal
            variant="ghost"
            size="xs"
            className="text-muted-foreground"
          />
        </div>
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
        <Button type="submit" disabled={isPending}>
          {isPending ? (
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

/**
 * Bouton [➕ Ajouter un document] et modale de création associée.
 *
 * `ownerName` (nom complet de l'apprenant / du candidat, ex : « Dupont
 * Jean ») alimente l'arborescence Drive générée automatiquement dans le
 * formulaire : `EduFlow / [Nom_Prénom_Apprenant] / [Nom_Document]`.
 */
export function AddDocumentModal({
  owner,
  ownerName,
}: {
  owner: DocumentsOwner;
  ownerName?: string | null;
}) {
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
            Joignez une pièce officielle à ce dossier en collant un lien public
            (Google Drive, OneDrive, DropBox…). Le fichier reste sur votre
            stockage externe gratuit — EduFlow n&apos;en conserve que le lien.
          </DialogDescription>
        </DialogHeader>

        <AddDocumentForm
          key={formKey}
          owner={owner}
          ownerName={ownerName ?? null}
          onCreated={handleCreated}
        />
      </DialogContent>
    </Dialog>
  );
}