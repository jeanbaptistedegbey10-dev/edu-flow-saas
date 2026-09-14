"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  DownloadIcon,
  FileUpIcon,
  Loader2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";

import { importStudentsFromCsvAction } from "@/actions/students";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ToastNotification } from "@/components/ui/toast";

/** Colonnes attendues dans le fichier CSV d'import. */
const CSV_TEMPLATE_HEADERS = [
  "Prénom",
  "Nom",
  "Email",
  "Téléphone",
  "Statut",
  "Source",
] as const;

/** Statuts valides pour l'import. */
const VALID_STATUSES = ["Inscrit", "Prospect", "Abandonné"] as const;

type ImportState = {
  status: "idle" | "pending" | "success" | "error";
  message?: string;
  imported?: number;
  skipped?: number;
};

const INITIAL_STATE: ImportState = { status: "idle" };

/** Génère le contenu CSV du modèle téléchargeable. */
function generateTemplateCsv(): string {
  const headers = CSV_TEMPLATE_HEADERS.join(";");
  const example1 = "Jean;Dupont;jean.dupont@email.com;+225 05 00 00 00 01;Prospect;Recommandation";
  const example2 = "Marie;Kouadio;marie.k@email.com;+225 07 00 00 00 02;Inscrit;Site web";
  const example3 = "Paul;Yao;paul.yao@email.com;+225 01 00 00 00 03;Inscrit;Facebook";
  return [headers, example1, example2, example3].join("\r\n");
}

/** Déclenche le téléchargement du modèle CSV. */
function downloadTemplate(): void {
  const BOM = "﻿";
  const blob = new Blob([`${BOM}${generateTemplateCsv()}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "modele-import-etudiants.csv";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Analyse un fichier CSV et retourne les lignes (sans l'en-tête). */
function parseCsv(content: string): string[][] {
  const lines = content
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "");

  if (lines.length === 0) return [];

  const dataLines = lines.slice(1);

  return dataLines.map((line) => {
    const delimiter = line.includes(";") ? ";" : ",";
    return line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));
  });
}


export function ImportStudentsDialog() {
  const [open, setOpen] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string[][]>([]);
  const [csvContent, setCsvContent] = React.useState<string>("");
  const [toast, setToast] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [state, formAction, pending] = useActionState(
    importStudentsFromCsvAction,
    INITIAL_STATE
  );

  function handleFileSelect(selectedFile: File) {
    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const rows = parseCsv(content);
      setPreview(rows.slice(0, 10));
      setCsvContent(content);
    };
    reader.readAsText(selectedFile, "UTF-8");
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith(".csv") || droppedFile.type === "text/csv")) {
      handleFileSelect(droppedFile);
    } else {
      setToast("Veuillez déposer un fichier CSV valide.");
    }
  }

  function handleZoneClick() {
    fileInputRef.current?.click();
  }

  React.useEffect(() => {
    if (state.status === "success") {
      setToast(`${state.imported ?? 0} étudiant(s) importé(s), ${state.skipped ?? 0} ignoré(s).`);
      setFile(null);
      setPreview([]);
      setCsvContent("");
    } else if (state.status === "error" && state.message) {
      setToast(state.message);
    }
  }, [state]);

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setFile(null);
      setPreview([]);
      setCsvContent("");
    }
    setOpen(newOpen);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <UploadIcon data-icon="inline-start" />
            Importer (CSV)
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importer des étudiants / prospects</DialogTitle>
            <DialogDescription>
              Importez en masse vos étudiants et prospects depuis un fichier CSV.
              Téléchargez le modèle pour respecter le format attendu.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
              <DownloadIcon data-icon="inline-start" />
              Télécharger le modèle CSV
            </Button>
            <span className="text-xs text-muted-foreground">
              Colonnes : Prénom, Nom, Email, Téléphone, Statut (Inscrit/Prospect), Source
            </span>
          </div>
          <form action={formAction}>
            <div
              onClick={handleZoneClick}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              className="mt-4 flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20 transition-colors hover:border-primary/50 hover:bg-muted/40"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0];
                  if (selectedFile) handleFileSelect(selectedFile);
                }}
              />
              {file ? (
                <div className="flex flex-col items-center gap-1 p-4 text-center">
                  <FileUpIcon className="size-8 text-primary" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} Ko • {preview.length} ligne(s)
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setPreview([]);
                      setCsvContent("");
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                  >
                    <XIcon className="size-3" />
                    Retirer
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 p-4 text-center">
                  <UploadIcon className="size-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium">Glissez-déposez votre fichier CSV ici</p>
                  <p className="text-xs text-muted-foreground">ou cliquez pour parcourir</p>
                </div>
              )}
            </div>
            {preview.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Aperçu (10 premières lignes) :
                </p>
                <div className="max-h-[200px] overflow-auto rounded border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="px-2 py-1 text-left">#</th>
                        <th className="px-2 py-1 text-left">Prénom</th>
                        <th className="px-2 py-1 text-left">Nom</th>
                        <th className="px-2 py-1 text-left">Email</th>
                        <th className="px-2 py-1 text-left">Tél</th>
                        <th className="px-2 py-1 text-left">Statut</th>
                        <th className="px-2 py-1 text-left">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, index) => (
                        <tr key={index} className="border-t">
                          <td className="px-2 py-1 text-muted-foreground">{index + 1}</td>
                          <td className="px-2 py-1">{row[0] ?? ""}</td>
                          <td className="px-2 py-1">{row[1] ?? ""}</td>
                          <td className="px-2 py-1">{row[2] ?? ""}</td>
                          <td className="px-2 py-1">{row[3] ?? ""}</td>
                          <td className="px-2 py-1">
                            <span className={VALID_STATUSES.includes(row[4] as typeof VALID_STATUSES[number]) ? "text-emerald-600" : "text-amber-600"}>
                              {row[4] ?? "(défaut: Prospect)"}
                            </span>
                          </td>
                          <td className="px-2 py-1">{row[5] ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <input type="hidden" name="csvContent" value={csvContent} readOnly />
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Annuler
              </Button>
              <Button type="submit" disabled={!file || pending}>
                {pending ? (
                  <Loader2Icon data-icon="inline-start" className="animate-spin" />
                ) : (
                  <UploadIcon data-icon="inline-start" />
                )}
                {pending ? "Import en cours..." : "Importer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ToastNotification message={toast} onClose={() => setToast(null)} />
    </>
  );
}