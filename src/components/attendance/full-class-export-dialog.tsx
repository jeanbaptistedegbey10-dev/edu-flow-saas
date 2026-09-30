"use client";

import * as React from "react";
import {
  BookOpenIcon,
  ClipboardListIcon,
  DownloadIcon,
  FileTextIcon,
  Loader2Icon,
} from "lucide-react";

import {
  getFullClassExport,
  type FullClassExportDTO,
} from "@/actions/attendance";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { exportToCsv } from "@/lib/export";
import { printHtmlDocument } from "@/lib/receipt";
import {
  buildFullAttendanceCsv,
  buildFullAttendanceDocument,
  buildFullCombinedDocument,
  buildFullLogbookCsv,
} from "@/lib/full-class-export";


function fileDateStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
}

function slugify(value: string): string {
  const ascii = value.normalize("NFD").replace(/[^a-zA-Z0-9]+/g, "-");
  return ascii.replace(/^-+|-+$/g, "").toLowerCase() || "classe";
}

export function FullClassExportDialog({
  classId,
  className,
  disabled = false,
}: {
  classId: string;
  className: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<FullClassExportDTO | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getFullClassExport(classId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  React.useEffect(() => {
    // Chargement différé (règle react-hooks/set-state-in-effect) :
    // `load()` met à jour l'état, on l'appelle donc hors du corps synchrone.
    if (open) Promise.resolve().then(() => load());
  }, [open, load]);

  /** Ouverture / fermeture : réinitialisation dans le handler (pas d'effet). */
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setData(null);
      setError(null);
      setBusy(null);
    }
  };

  const stamp = data ? `${slugify(data.className)}-${fileDateStamp()}` : "";
  const sessionCount = data?.sessions.length ?? 0;
  const rosterCount = data?.roster.length ?? 0;
  const idle = busy === null;

  const exportAttendanceCsv = () => {
    if (!data || !idle) return;
    setBusy("a");
    try {
      exportToCsv(`feuille-presence-${stamp}`, buildFullAttendanceCsv(data), [
        { header: "Date", value: (r) => r.date },
        { header: "Seance", value: (r) => r.session },
        { header: "Chapitre", value: (r) => r.chapter },
        { header: "Matricule", value: (r) => r.studentCode },
        { header: "Nom", value: (r) => r.lastName },
        { header: "Prenom", value: (r) => r.firstName },
        { header: "Statut", value: (r) => r.status },
        { header: "Heure", value: (r) => r.arrivalTime },
        { header: "Motif", value: (r) => r.notes },
      ]);
    } finally {
      setBusy(null);
    }
  };

  const exportLogbookCsv = () => {
    if (!data || !idle) return;
    setBusy("b");
    try {
      exportToCsv(`cahier-de-texte-${stamp}`, buildFullLogbookCsv(data), [
        { header: "Date", value: (r) => r.date },
        { header: "Titre", value: (r) => r.title },
        { header: "Chapitre", value: (r) => r.chapter },
        { header: "Resume", value: (r) => r.summary },
        { header: "Horaires", value: (r) => r.hours },
        { header: "Enseignant", value: (r) => r.teacher },
        { header: "Presents", value: (r) => r.present },
        { header: "Effectif", value: (r) => r.total },
        { header: "Statut", value: (r) => r.status },
      ]);
    } finally {
      setBusy(null);
    }
  };

  const printDoc = (kind: "attendance" | "logbook" | "combined") => {
    if (!data) return;
    if (kind === "attendance") printHtmlDocument(buildFullAttendanceDocument(data));
    else if (kind === "logbook") printHtmlDocument(buildFullCombinedDocument(data, "logbook"));
    else printHtmlDocument(buildFullCombinedDocument(data));
  };

  const off = !data || sessionCount === 0 || !idle;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <DownloadIcon data-icon="inline-start" />
          Exporter (toute la classe)
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export global — {className}</DialogTitle>
          <DialogDescription>
            Toutes les séances confondues, sur toute la durée de la classe.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Chargement des séances…
          </p>
        ) : error ? (
          <div className="space-y-3 py-2">
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Réessayer
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 py-1">
            <p className="text-xs text-muted-foreground">
              {sessionCount} seance{sessionCount > 1 ? "s" : ""} — {rosterCount} apprenant
              {rosterCount > 1 ? "s" : ""}.
            </p>
            <div className="rounded-xl border p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardListIcon className="size-4 text-primary" />
                a) Feuille de présence (historique complet)
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={exportAttendanceCsv} disabled={off}>
                  <DownloadIcon data-icon="inline-start" />
                  Exporter CSV
                </Button>
                <Button size="sm" variant="outline" onClick={() => printDoc("attendance")} disabled={off}>
                  Imprimer / PDF
                </Button>
              </div>
            </div>
            <div className="rounded-xl border p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <BookOpenIcon className="size-4 text-primary" />
                b) Cahier de texte complet
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={exportLogbookCsv} disabled={off}>
                  <DownloadIcon data-icon="inline-start" />
                  Exporter CSV
                </Button>
                <Button size="sm" variant="outline" onClick={() => printDoc("logbook")} disabled={off}>
                  Imprimer / PDF
                </Button>
              </div>
            </div>
            <div className="rounded-xl border p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <FileTextIcon className="size-4 text-primary" />
                c) Rapport combiné (présences + cahier)
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={() => printDoc("combined")} disabled={off}>
                  <DownloadIcon data-icon="inline-start" />
                  Imprimer / PDF
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
