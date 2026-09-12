"use client";

import * as React from "react";
import { Loader2Icon, PrinterIcon, TriangleAlertIcon } from "lucide-react";

import type { OrganizationProfileDTO } from "@/actions/payments";
import {
  getPremiumReportForStudent,
  type PremiumReportDTO,
} from "@/actions/evaluations";
import { getCurrentOrganizationProfile } from "@/actions/payments";
import { ReportCardDialog } from "@/components/evaluations/report-card-dialog";
import { Button } from "@/components/ui/button";

/**
 * Bouton « Voir / Imprimer le rapport » (fiche détaillée d'un étudiant).
 *
 * Ouvre la modale `ReportCardDialog` avec le bulletin premium en temps réel :
 * les données sont récupérées via les Server Actions au clic (jamais de
 * téléchargement direct déclenché par simple navigation).
 */
export function StudentReportButton({
  studentId,
}: {
  studentId: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<PremiumReportDTO | null>(null);
  const [organization, setOrganization] =
    React.useState<OrganizationProfileDTO | null>(null);

  const handleOpen = async () => {
    setErrorMessage(null);
    setLoading(true);
    try {
      const [dto, org] = await Promise.all([
        getPremiumReportForStudent(studentId),
        getCurrentOrganizationProfile(),
      ]);
      setReport({ ...dto, issuedAt: new Date(dto.issuedAt) });
      setOrganization(org);
      setOpen(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de générer le bulletin pour le moment."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void handleOpen()}
        disabled={loading}
        title="Voir ou imprimer le bulletin / rapport d'assiduité"
      >
        {loading ? (
          <Loader2Icon data-icon="inline-start" className="animate-spin" />
        ) : (
          <PrinterIcon data-icon="inline-start" />
        )}
        {loading ? "Chargement..." : "Voir / Imprimer le rapport"}
      </Button>

      {errorMessage ? (
        <p
          role="alert"
          className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
        >
          <TriangleAlertIcon data-icon="inline-start" />
          {errorMessage}
        </p>
      ) : null}

      {organization && report ? (
        <ReportCardDialog
          data={report}
          organization={organization}
          open={open}
          onOpenChange={setOpen}
        />
      ) : (
        <ReportCardDialog
          data={null}
          organization={{
            name: "Centre de Formation Excellence",
            address: null,
            city: null,
            phone: null,
            email: null,
            website: null,
            logoUrl: null,
            rccm: null,
            ifu: null,
          }}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}