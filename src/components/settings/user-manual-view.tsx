"use client";

import * as React from "react";
import {
  BookMarkedIcon,
  DownloadIcon,
  PrinterIcon,
} from "lucide-react";

import { MANUAL_CHAPTERS, MANUAL_TITLE, MANUAL_VERSION } from "@/data/user-manual";
import { buildUserManualHtml } from "@/lib/user-manual-document";
import { printHtmlDocument } from "@/lib/receipt";
import { Button } from "@/components/ui/button";

/**
 * Vue « Manuel d'Utilisation » (`/dashboard/guide`).
 *
 * L'aperçu et le document imprimé sont le MÊME HTML (`buildUserManualHtml`) :
 * l'iframe `srcdoc` affiche donc exactement ce qui sort de l'imprimante, sans
 * duplication de mise en page à maintenir.
 *
 * Le téléchargement passe par `printHtmlDocument` : la boîte d'impression du
 * navigateur s'ouvre sur le document A4, où « Enregistrer au format PDF » est
 * la destination — même mécanisme que les reçus et les certificats, et donc
 * sans dépendance PDF supplémentaire côté client.
 */
export function UserManualView({
  organizationName,
}: {
  /** Nom de l'établissement (page de garde du document). */
  organizationName: string;
}) {
  /**
   * Date d'édition figée au montage : le document ne doit pas changer de
   * contenu (ni provoquer d'écart d'hydratation) pendant que l'utilisateur
   * le parcourt.
   */
  const [issuedOn] = React.useState(() => new Date());

  const html = React.useMemo(
    () => buildUserManualHtml(organizationName, issuedOn),
    [organizationName, issuedOn]
  );

  /**
   * Adapte la hauteur de l'iframe à son contenu : le document est long
   * (une page par chapitre) et doit défiler intégralement dans l'aperçu.
   */
  const handlePreviewLoad = React.useCallback(
    (event: React.SyntheticEvent<HTMLIFrameElement>) => {
      try {
        const doc = event.currentTarget.contentDocument;

        if (!doc) return;

        const sheet = doc.getElementById("manual-sheet");

        if (!sheet) return;

        event.currentTarget.style.height = `${sheet.scrollHeight + 24}px`;
      } catch {
        /* iframe cross-origin : hauteur par défaut conservée. */
      }
    },
    []
  );

  const handlePrint = React.useCallback(() => {
    printHtmlDocument(html);
  }, [html]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0 md:gap-6 md:p-6 md:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {MANUAL_TITLE}
          </h1>
          <p className="text-sm text-muted-foreground">
            Guide complet d&apos;EduFlow en {MANUAL_CHAPTERS.length} chapitres,
            classés dans l&apos;ordre des dépendances système. Format A4 prêt à
            imprimer.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Version {MANUAL_VERSION} · un chapitre par page · aucune coupure de
            texte à l&apos;impression
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={handlePrint}>
            <DownloadIcon data-icon="inline-start" />
            Télécharger le PDF
          </Button>
          <Button type="button" variant="outline" onClick={handlePrint}>
            <PrinterIcon data-icon="inline-start" />
            Imprimer
          </Button>
        </div>
      </div>

      {/* Consigne de destination : évite la mauvaise surprises de l'impression
          sur du papier par défaut. */}
      <p className="rounded-lg border border-indigo-200 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
        Pour obtenir le fichier : cliquez sur « Télécharger le PDF », puis
        choisissez <strong>« Enregistrer au format PDF »</strong> comme
        destination d&apos;impression. Format papier A4, marges gérées
        automatiquement.
      </p>

      {/* Aperçu fidèle (le même document que le PDF) */}
      <div className="rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm dark:border-slate-800">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <BookMarkedIcon className="size-4 text-muted-foreground" />
              Aperçu du document
            </h2>
            <p className="text-xs text-muted-foreground">
              Aperçu conforme à l&apos;impression (210 × 297 mm, un chapitre par
              page).
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border bg-muted/40 p-3">
          <iframe
            title="Manuel d'utilisation EduFlow"
            srcDoc={html}
            onLoad={handlePreviewLoad}
            className="w-full min-h-[900px] rounded-md border bg-white"
          />
        </div>
      </div>
    </div>
  );
}
