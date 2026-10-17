"use client";

import * as React from "react";
import {
  AwardIcon,
  BadgeCheckIcon,
  FileDownIcon,
  ListChecksIcon,
  PrinterIcon,
  ScrollTextIcon,
  TrendingUpIcon,
} from "lucide-react";

import type {
  StudentAcademicRecordDTO,
  StudentEvaluationDTO,
} from "@/actions/evaluations";
import type { OrganizationProfileDTO } from "@/actions/payments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StudentPerformanceChart } from "@/components/students/student-performance-chart";
import {
  buildDefaultAppreciation,
  buildDefaultAttestationMessage,
  buildInternalAttestationDocument,
  buildReportCardDocument,
  getGradeMention,
  EMPTY_ATTESTATION_FIELDS,
  toAttestationDateInputValue,
  type AttestationFieldValues,
  type InternalAttestationInput,
  type ReportCardInput,
  type ReportCardModuleRow,
} from "@/lib/report-card";
import { printHtmlDocument } from "@/lib/receipt";
import { cn } from "@/lib/utils";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation entre le rendu serveur et le rendu client.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/** Statut visuel d'un module dans le tableau récapitulatif. */
function ModuleStatusBadge({
  score,
  passingScore,
}: {
  score: number | null;
  passingScore: number;
}) {
  if (score === null) {
    return (
      <span className={cn(BADGE_BASE_CLASSES, "bg-muted text-muted-foreground")}>
        Non noté
      </span>
    );
  }

  return score >= passingScore ? (
    <span
      className={cn(
        BADGE_BASE_CLASSES,
        "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
      )}
    >
      Validé
    </span>
  ) : (
    <span
      className={cn(
        BADGE_BASE_CLASSES,
        "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
      )}
    >
      Non validé
    </span>
  );
}

/** Carte statistique compacte du bandeau supérieur. */
function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <span className="[&_svg]:size-3.5">{icon}</span>
        {label}
      </p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Section repliable d'une évaluation dans le tableau récapitulatif. */
function EvaluationSection({
  evaluation,
}: {
  evaluation: StudentEvaluationDTO;
}) {
  const [open, setOpen] = React.useState(true);

  const gradedCount = evaluation.modules.filter(
    (moduleItem) => moduleItem.score !== null
  ).length;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <div>
          <h4 className="text-sm font-semibold">{evaluation.title}</h4>
          <p className="text-xs text-muted-foreground">
            {dateFormatter.format(evaluation.date)} · {evaluation.className} ·{" "}
            {evaluation.courseTitle}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm">
            <span className="text-muted-foreground">Moyenne : </span>
            <span className="font-semibold tabular-nums">
              {evaluation.averageOn100 === null
                ? "—"
                : `${numberFormatter.format(evaluation.averageOn100)} / 100`}
            </span>
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {gradedCount}/{evaluation.modules.length} noté
            {gradedCount > 1 ? "s" : ""}
          </span>
        </div>
      </button>

      {open ? (
        <table className="w-full border-t text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium">Module</th>
              <th className="px-4 py-2 text-right font-medium">Note</th>
              <th className="px-4 py-2 text-right font-medium">Barème</th>
              <th className="px-4 py-2 text-right font-medium">Seuil</th>
              <th className="px-4 py-2 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {evaluation.modules.map((moduleItem) => (
              <tr key={moduleItem.moduleId} className="border-b last:border-b-0">
                <td className="px-4 py-2.5 font-medium">
                  {moduleItem.moduleName}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right tabular-nums",
                    moduleItem.score !== null &&
                      moduleItem.score < moduleItem.passingScore &&
                      "font-semibold text-red-600 dark:text-red-400"
                  )}
                >
                  {moduleItem.score === null
                    ? "—"
                    : numberFormatter.format(moduleItem.score)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  /{numberFormatter.format(moduleItem.maxScore)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                  {numberFormatter.format(moduleItem.passingScore)}
                </td>
                <td className="px-4 py-2.5">
                  <ModuleStatusBadge
                    score={moduleItem.score}
                    passingScore={moduleItem.passingScore}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

export function StudentAcademicTab({
  record,
  studentName,
  studentCode,
  className,
  courseTitle,
  birthDate,
  city,
  startDate,
  organization,
}: {
  record: StudentAcademicRecordDTO;
  studentName: string;
  studentCode: string;
  /** Classe / cohorte active (ou dernière connue). */
  className: string | null;
  /** Intitulé du cours porteur. */
  courseTitle: string | null;
  /** Date de naissance (pré-remplissage `{{birthDate}}` de l'attestation). */
  birthDate: Date | null;
  /** Adresse / ville de résidence (variable `{{city}}`). */
  city: string | null;
  /** Date d'inscription (pré-remplissage du début du cours). */
  startDate: Date | null;
  organization: OrganizationProfileDTO;
}) {
  const hasGrades = record.stats.overallAverage !== null;

  // Lignes aplaties pour le bulletin de notes. Seuls les examens réellement
  // notés y figurent : un module programmé dont la note n'a pas été saisie
  // (score null) est exclu du bulletin et n'impacte pas les moyennes.
  const reportRows: ReportCardModuleRow[] = React.useMemo(
    () =>
      record.evaluations.flatMap((evaluation) =>
        evaluation.modules
          .filter((moduleItem) => moduleItem.score !== null)
          .map((moduleItem) => ({
            evaluationTitle: evaluation.title,
            evaluationDate: evaluation.date,
            moduleName: moduleItem.moduleName,
            score: moduleItem.score,
            maxScore: moduleItem.maxScore,
            passingScore: moduleItem.passingScore,
          }))
      ),
    [record.evaluations]
  );

  const reportCardInput: ReportCardInput = React.useMemo(
    () => ({
      studentName,
      studentCode,
      className,
      courseTitle,
      rows: reportRows,
      overallAverage: record.stats.overallAverage,
      validationRate: record.stats.validationRate,
      gradedModuleCount: record.stats.gradedModuleCount,
      validatedModuleCount: record.stats.validatedModuleCount,
    }),
    [
      studentName,
      studentCode,
      className,
      courseTitle,
      reportRows,
      record.stats,
    ]
  );

  // Champs d'information de l'attestation (naissance, résidence, calendrier
  // du cursus) : pré-remplis depuis la fiche étudiant puis éditables avant
  // impression — la base ne connaît ni la fin prévue ni la date d'examen.
  const birthDateIso = toAttestationDateInputValue(birthDate);
  const startDateIso = toAttestationDateInputValue(startDate);
  const [attestationFields, setAttestationFields] =
    React.useState<AttestationFieldValues>(() => ({
      ...EMPTY_ATTESTATION_FIELDS,
      birthDate: birthDateIso,
      city: city ?? "",
      startDate: startDateIso,
    }));
  // Réinitialisation à chaque changement d'étudiant (navigation entre fiches).
  React.useEffect(() => {
    setAttestationFields({
      ...EMPTY_ATTESTATION_FIELDS,
      birthDate: birthDateIso,
      city: city ?? "",
      startDate: startDateIso,
    });
  }, [birthDateIso, city, startDateIso]);

  const attestationInput: InternalAttestationInput = React.useMemo(
    () => ({
      studentName,
      studentCode,
      className,
      courseTitle,
      overallAverage: record.stats.overallAverage,
      validationRate: record.stats.validationRate,
      birthDate: attestationFields.birthDate || null,
      city: attestationFields.city.trim() || null,
      startDate: attestationFields.startDate || null,
      expectedEndDate: attestationFields.expectedEndDate || null,
      examDate: attestationFields.examDate || null,
    }),
    [
      studentName,
      studentCode,
      className,
      courseTitle,
      record.stats,
      attestationFields,
    ]
  );

  // Appréciation globale éditable avant impression du bulletin.
  // État dérivé : brouillon édité par l'utilisateur (`null` tant qu'il n'a
  // rien saisi), sinon appréciation auto-générée depuis la moyenne.
  const defaultAppreciation = React.useMemo(
    () =>
      buildDefaultAppreciation(
        record.stats.overallAverage,
        record.stats.validationRate
      ),
    [record.stats]
  );
  const [appreciationDraft, setAppreciationDraft] =
    React.useState<string | null>(null);
  const appreciation = appreciationDraft ?? defaultAppreciation;

  // Message de l'attestation éditable avant impression (attestation
  // « sur-mesure »). État dérivé : brouillon saisi par l'administration
  // (`null` tant qu'il n'a rien modifié), sinon texte par défaut.
  const defaultAttestationMessage = React.useMemo(
    () => buildDefaultAttestationMessage(),
    []
  );
  const [attestationMessageDraft, setAttestationMessageDraft] =
    React.useState<string | null>(null);
  const attestationMessage =
    attestationMessageDraft ?? defaultAttestationMessage;

  // Documents HTML mémoïsés (génération paresseuse à l'ouverture uniquement).
  const bulletinHtml = React.useMemo(
    () =>
      buildReportCardDocument(
        { ...reportCardInput, appreciation },
        organization
      ),
    [reportCardInput, appreciation, organization]
  );

  const attestationHtml = React.useMemo(
    () =>
      buildInternalAttestationDocument(
        { ...attestationInput, customMessage: attestationMessage },
        organization
      ),
    [attestationInput, attestationMessage, organization]
  );

  // Modales de documents.
  const [bulletinOpen, setBulletinOpen] = React.useState(false);
  const [attestationOpen, setAttestationOpen] = React.useState(false);

  /** Adapte la hauteur d'un aperçu iframe à son contenu. */
  const handlePreviewLoad = (
    event: React.SyntheticEvent<HTMLIFrameElement>
  ) => {
    const frame = event.currentTarget;
    const doc = frame.contentDocument;

    if (!doc?.documentElement) return;

    const contentHeight = doc.documentElement.scrollHeight;

    if (contentHeight > 0) {
      frame.style.height = `${Math.min(Math.max(contentHeight, 360), 560)}px`;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Bandeau statistiques */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<TrendingUpIcon />}
          label="Moyenne générale"
          value={
            record.stats.overallAverage === null
              ? "—"
              : `${numberFormatter.format(record.stats.overallAverage)} / 100`
          }
          hint={
            record.stats.overallAverage === null
              ? undefined
              : getGradeMention(record.stats.overallAverage)
          }
        />
        <StatCard
          icon={<BadgeCheckIcon />}
          label="Taux de validation"
          value={
            record.stats.validationRate === null
              ? "—"
              : `${numberFormatter.format(record.stats.validationRate)} %`
          }
          hint={`${record.stats.validatedModuleCount}/${record.stats.gradedModuleCount} modules validés`}
        />
        <StatCard
          icon={<ListChecksIcon />}
          label="Modules notés"
          value={String(record.stats.gradedModuleCount)}
          hint={`sur ${record.evaluations.reduce(
            (total, evaluation) => total + evaluation.modules.length,
            0
          )} modules évalués`}
        />
        <StatCard
          icon={<AwardIcon />}
          label="Examens passés"
          value={String(record.stats.evaluationCount)}
          hint="sessions d'évaluation internes"
        />
      </div>

      {/* Courbe de progression */}
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold">
          Évolution des notes au fil des examens internes
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Moyenne de l’étudiant par session, normalisée sur 100 (pondérée par
          les barèmes). La ligne pointillée orange matérialise le seuil de
          validation (60/100) ; survolez un point pour voir les modules
          validés de la session.
        </p>

        <StudentPerformanceChart evaluations={record.evaluations} />
      </section>

      {/* Boutons de documents officiels */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => setBulletinOpen(true)}
          disabled={reportRows.length === 0}
        >
          <FileDownIcon data-icon="inline-start" />
          Télécharger Bulletin de Notes
        </Button>
        <Button variant="outline" onClick={() => setAttestationOpen(true)}>
          <ScrollTextIcon data-icon="inline-start" />
          Attestation Interne
        </Button>
        {!hasGrades ? (
          <span className="text-xs text-muted-foreground">
            Le bulletin sera disponible dès qu’au moins une note sera saisie.
          </span>
        ) : null}
      </div>

      {/* Détail des évaluations */}
      {record.evaluations.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="font-medium">Aucune évaluation</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Aucune session d’examen interne n’est encore rattachée à la classe
            de cet étudiant.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {[...record.evaluations].reverse().map((evaluation) => (
            <EvaluationSection key={evaluation.id} evaluation={evaluation} />
          ))}
        </div>
      )}

      {/* Modale : aperçu + impression du bulletin */}
      <Dialog open={bulletinOpen} onOpenChange={setBulletinOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bulletin de notes</DialogTitle>
            <DialogDescription>
              Ajustez si besoin l’appréciation globale, puis imprimez le
              bulletin ou enregistrez-le en PDF via la fenêtre d’impression du
              navigateur.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="report-appreciation">
                Appréciation globale de l’enseignant
              </Label>
              <Textarea
                id="report-appreciation"
                value={appreciation}
                onChange={(event) => setAppreciationDraft(event.target.value)}
                rows={3}
                maxLength={1000}
              />
            </div>

            <div className="rounded-md border bg-muted/40 p-3">
              <iframe
                title="Aperçu du bulletin de notes"
                srcDoc={bulletinHtml}
                onLoad={handlePreviewLoad}
                className="h-[420px] w-full rounded-md border bg-card"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulletinOpen(false)}
            >
              Fermer
            </Button>
            <Button
              type="button"
              onClick={() => printHtmlDocument(bulletinHtml)}
            >
              <PrinterIcon data-icon="inline-start" />
              Imprimer / Enregistrer en PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale : aperçu + impression de l'attestation */}
      <Dialog open={attestationOpen} onOpenChange={setAttestationOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Attestation interne de formation</DialogTitle>
            <DialogDescription>
              Vérifiez les informations, puis imprimez l’attestation ou
              enregistrez-la en PDF via la fenêtre d’impression du navigateur.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="attestation-birthDate">Date de naissance</Label>
                <Input
                  id="attestation-birthDate"
                  type="date"
                  value={attestationFields.birthDate}
                  onChange={(event) =>
                    setAttestationFields((prev) => ({
                      ...prev,
                      birthDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="attestation-city">Ville de résidence</Label>
                <Input
                  id="attestation-city"
                  type="text"
                  placeholder="Ex : Abidjan"
                  value={attestationFields.city}
                  onChange={(event) =>
                    setAttestationFields((prev) => ({
                      ...prev,
                      city: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="attestation-startDate">Début du cours</Label>
                <Input
                  id="attestation-startDate"
                  type="date"
                  value={attestationFields.startDate}
                  onChange={(event) =>
                    setAttestationFields((prev) => ({
                      ...prev,
                      startDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="attestation-expectedEndDate">
                  Fin prévue du cours
                </Label>
                <Input
                  id="attestation-expectedEndDate"
                  type="date"
                  value={attestationFields.expectedEndDate}
                  onChange={(event) =>
                    setAttestationFields((prev) => ({
                      ...prev,
                      expectedEndDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="attestation-examDate">
                  Date de l’examen officiel
                </Label>
                <Input
                  id="attestation-examDate"
                  type="date"
                  value={attestationFields.examDate}
                  onChange={(event) =>
                    setAttestationFields((prev) => ({
                      ...prev,
                      examDate: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="attestation-message">
                Message de l’attestation (modifiable)
              </Label>
              <Textarea
                id="attestation-message"
                value={attestationMessage}
                onChange={(event) =>
                  setAttestationMessageDraft(event.target.value)
                }
                rows={4}
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground">
                Personnalisez le texte par défaut de l’attestation avant
                impression. Le champ est pré-rempli avec la formulation
                officielle de l’établissement pour un cursus en cours ;
                renseignez la date de fin prévue et la date de l’examen
                (inconnues de la base). Les variables{" "}
                <code>{"{{studentName}}"}</code>,{" "}
                <code>{"{{birthDate}}"}</code>, <code>{"{{city}}"}</code>,{" "}
                <code>{"{{startDate}}"}</code>,{" "}
                <code>{"{{expectedEndDate}}"}</code>,{" "}
                <code>{"{{examDate}}"}</code>,{" "}
                <code>{"{{courseName}}"}</code> et{" "}
                <code>{"{{organizationName}}"}</code> sont remplacées à
                l’impression et affichées en gras.
              </p>
            </div>

            <div className="rounded-md border bg-muted/40 p-3">
              <iframe
                title="Aperçu de l'attestation interne"
                srcDoc={attestationHtml}
                onLoad={handlePreviewLoad}
                className="h-[420px] w-full rounded-md border bg-card"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAttestationOpen(false)}
            >
              Fermer
            </Button>
            <Button
              type="button"
              onClick={() => printHtmlDocument(attestationHtml)}
            >
              <PrinterIcon data-icon="inline-start" />
              Imprimer / Enregistrer en PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}