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
  triggerPremiumReportPrint,
  usePremiumReportPrintCss,
} from "@/components/reports/premium-report-sheet";
import { BulletinAppreciationEditor } from "@/components/evaluations/bulletin-appreciation-editor";
import { ExamReportSheet } from "@/components/reports/exam-report-sheet";
import type { ExamReportDTO } from "@/actions/evaluations";
import type { PremiumReportOrganization } from "@/lib/premium-report";
import {
  defaultAppreciationForValidation,
  examAppreciationScope,
} from "@/lib/premium-report";
import { buildExamReportDocument } from "@/lib/exam-report-document";

/**
 * Modale d'apercu du BULLETIN D'EXAMEN restreint à une session d'évaluation
 * précise (affichée depuis la grille de saisie des notes).
 *
 * Contrairement à `ReportCardDialog` (récapitulatif complet de l'année,
 * accessible depuis la fiche détaillée de l'étudiant), cette modale n'affiche
 * QUE les modules de l'examen courant.
 *
 * - Le rendu `#print-area` reutilise le CSS d'impression scoped du bulletin
 *   premium : seule la zone du bulletin sort sur l'imprimante (A4).
 * - Le bouton secondaire « Télécharger (HTML) » exporte le document autonome
 *   (même charte) sous forme de fichier — téléchargement explicite consenté.
 */
export function ExamReportDialog({
  data,
  organization,
  open,
  onOpenChange,
}: {
  data: ExamReportDTO | null;
  organization: PremiumReportOrganization;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  usePremiumReportPrintCss();

  /**
   * Texte d'appréciation affiché : le serveur renvoie déjà le texte
   * personnalisé s'il existe, l'état local reflète immédiatement
   * l'enregistrement (écran + impression + document téléchargé).
   */
  const [appreciation, setAppreciation] = React.useState(
    data?.appreciation ?? ""
  );
  const [previousData, setPreviousData] = React.useState(data);
  const automaticAppreciation = React.useMemo(
    () =>
      data === null
        ? ""
        : defaultAppreciationForValidation(
            data.validatedModules,
            data.gradedModules
          ),
    [data]
  );

  // Ajustement d'état lors du changement de bulletin (pattern React
  // « adjusting state when a prop changes ») : évite un effet qui
  // déclencherait un rendu en cascade à chaque ouverture de modale.
  if (data !== previousData) {
    setPreviousData(data);
    setAppreciation(data?.appreciation ?? "");
  }

  const handleDownload = React.useCallback(() => {
    if (!data) return;
    const html = buildExamReportDocument(
      { ...data, appreciation },
      organization
    );
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${data.documentNumber}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [appreciation, data, organization]);

  const studentName =
    data == null
      ? "—"
      : `${data.studentFirstName} ${data.studentLastName}`.trim() || "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl print:shadow-none">
        <DialogHeader className="print:hidden">
          <DialogTitle>
            Bulletin de l&apos;examen — {studentName}
            {data ? ` · ${data.evaluationTitle}` : ""}
          </DialogTitle>
          <DialogDescription>
            Ce bulletin est restreint à cet examen uniquement (sans
            l&apos;historique des autres évaluations). Le récapitulatif complet
            de l&apos;année reste disponible dans la fiche de l&apos;étudiant.
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
          <div
            data-print-shell="true"
            className="rounded-xl border bg-muted/40 p-3 print:border-0 print:bg-white print:p-0"
          >
            <ExamReportSheet
              data={{ ...data, appreciation }}
              organization={organization}
            />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            Aucune donnée de bulletin à afficher.
          </p>
        )}

        {/* Appréciation éditable : PERSISTÉE en base (`BulletinAppreciation`),
            affichée sur le bulletin, à l'impression et dans le fichier
            téléchargé. Rendue hors de `#print-area` → jamais imprimée. */}
        {data ? (
          <BulletinAppreciationEditor
            studentId={data.studentId}
            scope={examAppreciationScope(data.evaluationId)}
            value={appreciation}
            automaticText={automaticAppreciation}
            isCustom={appreciation !== automaticAppreciation}
            readOnly={data.classStatus === "ARCHIVED"}
            label="Appréciation de cet examen"
            onSaved={(text) => setAppreciation(text)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
