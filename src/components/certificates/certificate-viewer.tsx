"use client";

import * as React from "react";
import { Download, Printer } from "lucide-react";

import type { OrganizationProfileDTO } from "@/actions/payments";
import type { CertificateDTO } from "@/lib/actions/certificates";
import { Button } from "@/components/ui/button";
import { downloadCertificatePdf } from "@/lib/certificate-pdf";
import { buildCertificateHtml } from "@/lib/certificate-html";
import { printHtmlDocument } from "@/lib/receipt";

interface CertificateViewerProps {
  certificate: CertificateDTO;
  organization: OrganizationProfileDTO;
}

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation.
const statementDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Visionneuse de certificat : aperçu fidèle du document A4 PAYSAGE
 * (`buildCertificateHtml`) + impression via la boîte de dialogue système
 * (CSS `@page { size: A4 landscape; margin: 0 }`) + téléchargement PDF
 * (@react-pdf/renderer, page 842 × 595 pt — paysage également).
 */
export function CertificateViewer({ certificate, organization }: CertificateViewerProps) {
  /** HTML du certificat (reconstruit si le certificat change). */
  const html = React.useMemo(
    () =>
      buildCertificateHtml({
        studentName: certificate.studentName,
        studentCode: certificate.studentCode,
        birthDate: certificate.studentBirthDate,
        level: certificate.level,
        score: certificate.score,
        issueDate: new Date(certificate.issueDate),
        verificationCode: certificate.verificationCode,
        verificationUrl:
          typeof window !== "undefined"
            ? `${window.location.origin}/verify/${certificate.verificationCode}`
            : `/verify/${certificate.verificationCode}`,
        organizationName: organization.name,
        courseTitle: certificate.courseTitle,
        // Modèle graphique + identité visuelle et mentions légales de
        // l'organisation (logo, filigrane, pied de page, QR code).
        template: organization.certificateTemplate,
        certificateTextTemplate: organization.certificateTextTemplate,
        logoUrl: organization.logoUrl,
        organizationEmail: organization.email,
        organizationPhone: organization.phone,
        organizationAddress: organization.address,
        organizationCity: organization.city,
        organizationWebsite: organization.website,
        organizationRccm: organization.rccm,
        organizationIfu: organization.ifu,
      }),
    [certificate, organization]
  );

  const handlePrint = () => {
    printHtmlDocument(html);
  };

  const handleDownloadPdf = async () => {
    try {
      await downloadCertificatePdf(certificate.id);
    } catch (error) {
      console.error(
        "[CertificateViewer] Erreur lors du téléchargement PDF:",
        error
      );
    }
  };

  /** Adapte la hauteur de l'iframe d'aperçu à son contenu. */
  const handlePreviewLoad = (
    event: React.SyntheticEvent<HTMLIFrameElement>
  ) => {
    try {
      const doc = event.currentTarget.contentDocument;
      if (!doc) return;
      const target = doc.getElementById("certificate");
      if (!target) return;
      event.currentTarget.style.height = `${target.scrollHeight + 24}px`;
    } catch {
      /* iframe cross-origin : hauteur par défaut conservée. */
    }
  };

  return (
    <div className="space-y-4">
      {/* Aperçu fidèle du certificat (document A4 paysage) */}
      <div className="rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm dark:border-slate-800">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">
              Certificat de Compétence — A4 Paysage
            </h3>
            <p className="text-xs text-muted-foreground">
              Aperçu conforme à l&apos;impression (297 × 210 mm).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={handlePrint}>
              <Printer data-icon="inline-start" />
              Imprimer
            </Button>
            <Button size="sm" variant="outline" onClick={handleDownloadPdf}>
              <Download data-icon="inline-start" />
              Télécharger PDF
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border bg-muted/40 p-3">
          <iframe
            title={`Certificat ${certificate.studentName}`}
            srcDoc={html}
            onLoad={handlePreviewLoad}
            className="w-full min-h-[560px] rounded-md border bg-white"
          />
        </div>

        {certificate.revoked && (
          <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Ce certificat a été révoqué : il reste consultable à titre
            d&apos;historique mais ne devrait plus être remis à l&apos;étudiant.
          </p>
        )}
      </div>

      {/* Récapitulatif des informations du certificat */}
      <div className="rounded-xl border border-slate-200/80 bg-card p-4 shadow-sm dark:border-slate-800">
        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Étudiant</p>
            <p className="font-medium">{certificate.studentName}</p>
            <p className="text-xs text-muted-foreground">
              N° {certificate.studentCode}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Niveau</p>
            <p className="font-medium">{certificate.level}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Émis le</p>
            <p className="font-medium">
              {statementDateFormatter.format(new Date(certificate.issueDate))}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Code de vérification</p>
            <p className="font-mono font-medium">
              {certificate.verificationCode}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
