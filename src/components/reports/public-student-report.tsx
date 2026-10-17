"use client";

import * as React from "react";
import { PrinterIcon, ShieldCheckIcon } from "lucide-react";

import {
  PremiumReportSheet,
  usePremiumReportPrintCss,
  triggerPremiumReportPrint,
} from "@/components/reports/premium-report-sheet";
import { Button } from "@/components/ui/button";
import type {
  PremiumReportData,
  PremiumReportOrganization,
} from "@/lib/premium-report";

/**
 * Page publique du « lien parent » : aucun compte requis.
 *
 * Affiche le bulletin premium (même charte que la modale du dashboard) en
 * lecture seule et permet de l'imprimer via `window.print()` — seule la zone
 * `#print-area` sort sur l'imprimante.
 */
export function PublicStudentReport({
  data,
  organization,
}: {
  data: PremiumReportData;
  organization: PremiumReportOrganization;
}): React.ReactElement {
  usePremiumReportPrintCss();

  const studentName =
    `${data.studentFirstName} ${data.studentLastName}`.trim() || "—";

  return (
    <main className="min-h-screen bg-muted/40 print:bg-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-6 print:hidden" data-print-hide="true">
        <header className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Rapport parent — {studentName}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Document confidentiel en lecture seule · Code{" "}
                <span className="font-mono">{data.studentCode}</span> · N°{" "}
                <span className="tabular-nums">{data.documentNumber}</span>
              </p>
            </div>
            <Button
              type="button"
              onClick={triggerPremiumReportPrint}
              title="Imprimer le bulletin (format A4)"
            >
              <PrinterIcon data-icon="inline-start" />
              Imprimer
            </Button>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" />
            Ce lien sécurisé ne permet aucune modification. Toute reproduction
            sans le cachet officiel de l&apos;établissement est sans valeur.
          </p>
        </header>
      </div>

      <div
        data-print-shell="true"
        className="rounded-xl border bg-muted/40 p-3 print:border-0 print:bg-white print:p-0"
      >
        <PremiumReportSheet data={data} organization={organization} />
      </div>
    </main>
  );
}