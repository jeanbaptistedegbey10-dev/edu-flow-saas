"use client";

import * as React from "react";
import { DownloadIcon, PrinterIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PremiumReportSheet,
  usePremiumReportPrintCss,
  triggerPremiumReportPrint,
} from "@/components/reports/premium-report-sheet";
import type {
  PremiumReportData,
  PremiumReportOrganization,
} from "@/lib/premium-report";
import { buildPremiumReportDocument } from "@/lib/premium-report-document";

/**
 * Modale d'apercu du bulletin premium (Radix `Dialog`).
 *
 * - Le rendu `#print-area` est partage avec la page publique du lien parent
 *   (`PremiumReportSheet`) : charte visuelle identique partout.
 * - Le bouton principal « Imprimer » appelle `window.print()` avec un CSS
 *   d'impression scoped : seule `#print-area` sort sur l'imprimante (A4), les
 *   boutons et le fond de la modale restent invisibles.
 * - Le bouton secondaire « Télécharger (HTML) » exporte le document autonome
 *   (même charte) sous forme de fichier — téléchargement explicite consenté.
 */

export function ReportCardDialog({
  data,
  organization,
  open,
  onOpenChange,
}: {
  data: PremiumReportData | null;
  organization: PremiumReportOrganization;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  usePremiumReportPrintCss();

  const handleDownload = React.useCallback(() => {
    if (!data) return;
    const html = buildPremiumReportDocument(data, organization);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${data.documentNumber}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [data, organization]);

  const studentName =
    data == null
      ? "—"
      : `${data.studentFirstName} ${data.studentLastName}`.trim() || "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl print:shadow-none">
        <DialogHeader className="print:hidden">
          <DialogTitle>Aperçu du bulletin — {studentName}</DialogTitle>
          <DialogDescription>
            Vérifiez le bulletin, puis imprimez-le. Seule la zone du bulletin
            sort sur l&apos;imprimante (format A4).
          </DialogDescription>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              onClick={triggerPremiumReportPrint}
              disabled={!data}
            >
              <PrinterIcon data-icon="inline-start" />
              Imprimer
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownload}
              disabled={!data}
            >
              <DownloadIcon data-icon="inline-start" />
              Télécharger (HTML)
            </Button>
          </div>
        </DialogHeader>

        {data ? (
          <div className="rounded-xl border bg-slate-100/70 p-3 print:border-0 print:bg-white print:p-0">
            <PremiumReportSheet data={data} organization={organization} />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            Aucune donnée de bulletin à afficher.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}