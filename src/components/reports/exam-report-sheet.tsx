"use client";

import * as React from "react";

import type {
  ExamReportData,
  ExamReportRow,
} from "@/lib/exam-report";
import {
  formatOrganizationAddress,
  formatScore,
  formatScoreOnScale,
  type PremiumReportOrganization,
} from "@/lib/premium-report";
import { ReportAttendanceBlock } from "@/components/reports/report-attendance-block";

/**
 * Feuille A4 « Bulletin d'examen » — document RESTREINT à une session
 * d'évaluation précise, affiché dans la modale de la grille de notes
 * (`ExamReportDialog`).
 *
 * `#print-area` est la seule zone imprimee : le CSS d'impression scoped
 * (`usePremiumReportPrintCss` / `body.report-printing`) masque tout le reste
 * de la page puis rend la zone visible — la même mécanique que le bulletin
 * récapitulatif premium, avec une charte visuelle identique.
 */

const frDateLong = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const frDateShort = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function ExamInitialBadge({ name }: { name: string }): React.ReactElement {
  const initial = name.trim().charAt(0).toUpperCase() || "C";
  return (
    <span
      aria-hidden="true"
      className="flex size-12 shrink-0 items-center justify-center rounded-xl text-xl font-extrabold text-white"
      style={{ background: "linear-gradient(135deg,#4f46e5,#3730a3)" }}
    >
      {initial}
    </span>
  );
}

// --------------------------------------
// En-tete institutionnel
// --------------------------------------

function ExamReportHeader({
  organization,
  documentNumber,
}: {
  organization: PremiumReportOrganization;
  documentNumber: string;
}): React.ReactElement {
  const address = formatOrganizationAddress(organization);
  return (
    <header className="flex w-full items-start justify-between gap-4 border-b-[3px] border-indigo-900 pb-3">
      {/* Bloc gauche (Branding) : logo, nom de l'établissement puis adresse. */}
      <div className="flex w-[55%] flex-col items-start gap-1">
        {organization.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={organization.logoUrl}
            alt="Logo de l'établissement"
            className="block h-12 w-auto max-w-[220px] object-contain object-left"
          />
        ) : (
          <ExamInitialBadge name={organization.name} />
        )}
        <p className="text-base font-bold leading-tight text-indigo-950">
          {organization.name}
        </p>
        {address ? (
          <p className="text-xs text-slate-600">{address}</p>
        ) : null}
      </div>
      {/* Bloc droite : badge de portée, contacts puis numéro de document. */}
      <div className="flex w-[40%] flex-col items-end gap-2 text-right">
        <span
          className="inline-block rounded-md px-3 py-1.5 text-[13px] font-extrabold tracking-widest text-white uppercase"
          style={{ background: "linear-gradient(135deg,#4f46e5,#3730a3)" }}
        >
          Bulletin d&apos;examen
        </span>
        {organization.phone || organization.email || organization.website ? (
          <p className="text-[11px] leading-relaxed text-slate-500">
            {organization.phone ? `Tél. : ${organization.phone}` : null}
            {organization.phone ? <br /> : null}
            {organization.email ? `Email : ${organization.email}` : null}
            {organization.email ? <br /> : null}
            {organization.website ? `Site web : ${organization.website}` : null}
          </p>
        ) : null}
        <p className="text-[11px] text-slate-600 tabular-nums">
          N° {documentNumber}
        </p>
      </div>
    </header>
  );
}

// --------------------------------------
// Cartouche examen / élève
// --------------------------------------

function ExamStudentCard({
  data,
  studentName,
}: {
  data: ExamReportData;
  studentName: string;
}): React.ReactElement {
  const fields: Array<[string, string]> = [
    ["Élève", studentName],
    ["Matricule", data.studentCode],
    ["Examen", data.evaluationTitle],
    ["Date de l'examen", frDateShort.format(data.evaluationDate)],
    ["Période / Semestre", data.periodLabel ?? "—"],
    ["Classe / Groupe", data.className],
    ["Cours", `${data.courseTitle} (${data.courseCode})`],
    ["Professeur responsable", data.teacherName ?? "—"],
  ];
  return (
    <section className="avoid-break print-section mt-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        {fields.map(([label, value]) => (
          <div key={label} className="text-[11.5px] text-slate-700">
            <span className="block text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              {label}
            </span>
            {value}
          </div>
        ))}
      </div>
    </section>
  );
}

// --------------------------------------
// Tableau des notes de CET examen
// --------------------------------------

function verdictBadge(
  gradedModules: number,
  validatedModules: number
): { label: string; className: string } {
  if (gradedModules === 0) {
    return {
      label: "En attente de notes",
      className: "bg-slate-100 text-slate-500",
    };
  }
  if (validatedModules === gradedModules) {
    return {
      label: "Examen validé",
      className: "bg-emerald-100 text-emerald-800",
    };
  }
  if (validatedModules === 0) {
    return {
      label: "Examen non validé",
      className: "bg-red-100 text-red-700",
    };
  }
  return {
    label: `${validatedModules} / ${gradedModules} validés`,
    className: "bg-amber-100 text-amber-800",
  };
}

function ExamGradeRow({ row }: { row: ExamReportRow }): React.ReactElement {
  return (
    <tr className="border-t border-slate-100 odd:bg-white even:bg-slate-50">
      <td className="px-3 py-1.5">
        <span className="block font-medium">{row.module}</span>
        <span className="block text-[10px] text-slate-400">
          Seuil de validation : {formatScore(row.passingScore)}
        </span>
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">
        {formatScore(row.maxScore)}
      </td>
      <td className="px-3 py-1.5 text-right font-bold tabular-nums">
        {formatScoreOnScale(row.score, row.maxScore)}
      </td>
      <td className="px-3 py-1.5 text-center">
        {row.passed === true ? (
          <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800">
            Validé
          </span>
        ) : row.passed === false ? (
          <span className="inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-extrabold text-red-700">
            Non validé
          </span>
        ) : (
          <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
            Non noté
          </span>
        )}
      </td>
    </tr>
  );
}

function ExamGradesTable({
  data,
}: {
  data: ExamReportData;
}): React.ReactElement {
  const verdict = verdictBadge(data.gradedModules, data.validatedModules);
  return (
    <div>
      <h3 className="mt-3 mb-1 text-xs font-extrabold tracking-widest text-indigo-800 uppercase">
        Modules évalués à cet examen
      </h3>
      <div className="avoid-break print-section overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-indigo-950 text-left text-[11px] tracking-wide text-white uppercase">
              <th className="px-3 py-1.5 font-bold">Module</th>
              <th className="px-3 py-1.5 text-right font-bold">Barème</th>
              <th className="px-3 py-1.5 text-right font-bold">Note obtenue</th>
              <th className="px-3 py-1.5 text-center font-bold">Statut</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-4 text-center text-slate-400"
                >
                  Aucun module configuré pour cet examen.
                </td>
              </tr>
            ) : (
              data.rows.map((row, index) => (
                <ExamGradeRow key={`${row.module}-${index}`} row={row} />
              ))
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-indigo-700 bg-indigo-50 font-extrabold">
              <td className="px-3 py-1.5">Modules validés</td>
              <td />
              <td className="px-3 py-1.5 text-right tabular-nums">
                {data.gradedModules > 0
                  ? `${data.validatedModules} / ${data.gradedModules}`
                  : "—"}
              </td>
              <td className="px-3 py-1.5 text-center">
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${verdict.className}`}
                >
                  {verdict.label}
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-slate-400">
        Bulletin restreint à l&apos;examen « {data.evaluationTitle} » — le
        récapitulatif complet de l&apos;année est disponible dans la fiche de
        l&apos;étudiant.
      </p>
    </div>
  );
}

// --------------------------------------
// Signatures & pied de page
// --------------------------------------

function ExamReportSignatures(): React.ReactElement {
  return (
    <section className="avoid-break print-section mt-3 flex gap-4">
      <div className="relative h-16 flex-1 rounded-lg border border-dashed border-slate-400">
        <span className="absolute top-2 left-3 text-[10px] text-slate-500">
          Signature de l&apos;enseignant
        </span>
      </div>
      <div className="relative h-16 flex-1 rounded-lg border border-dashed border-slate-400">
        <span className="absolute top-2 left-3 text-[10px] text-slate-500">
          Direction / Cachet officiel
        </span>
      </div>
    </section>
  );
}

function ExamReportFooter({
  data,
  organization,
}: {
  data: ExamReportData;
  organization: PremiumReportOrganization;
}): React.ReactElement {
  const legal = [organization.rccm, organization.ifu]
    .filter((p): p is string => p !== null && p.trim().length > 0)
    .join(" · ");
  return (
    <footer className="print-section mt-3 border-t border-slate-300 pt-2 text-center">
      {legal ? (
        <p className="text-[10px] text-slate-500">{legal}</p>
      ) : null}
      <p className="mt-0.5 text-[10px] text-slate-400">
        Document N° {data.documentNumber} — généré le{" "}
        {frDateLong.format(data.issuedAt)} · vérifiable auprès de{" "}
        {organization.name}
        {organization.phone ? ` · ${organization.phone}` : ""}. Toute
        reproduction sans le cachet officiel est sans valeur. Document
        strictement confidentiel.
      </p>
    </footer>
  );
}

// --------------------------------------
// Feuille A4 complete (#print-area)
// --------------------------------------

export function ExamReportSheet({
  data,
  organization,
}: {
  data: ExamReportData;
  organization: PremiumReportOrganization;
}): React.ReactElement {
  const studentName =
    `${data.studentFirstName} ${data.studentLastName}`.trim() || "—";

  return (
    <div
      id="print-area"
      className="relative mx-auto w-full max-w-[190mm] overflow-hidden rounded-lg bg-white px-8 py-7 shadow-sm print:max-w-none print:rounded-none print:shadow-none"
      style={{
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center select-none"
      >
        <span className="-rotate-[18deg] text-[130px] font-extrabold tracking-wide text-indigo-50">
          EXAMEN
        </span>
      </div>
      <div className="print-section report-body relative z-10">
        <ExamReportHeader
          organization={organization}
          documentNumber={data.documentNumber}
        />
        <ExamStudentCard data={data} studentName={studentName} />
        <ExamGradesTable data={data} />
        {/* Assiduité / Présences : bloc positionné AU-DESSUS de la zone
            d'appréciation, lisible ET visible à l'impression. */}
        {data.attendance !== null ? (
          <ReportAttendanceBlock
            metrics={data.attendance}
            caption={`Suivi des émargements — classe ${data.className}.`}
          />
        ) : null}
        <div className="avoid-break print-section mt-3 rounded-lg border border-slate-200 border-l-4 border-l-indigo-800 bg-slate-50 p-3">
          <p className="mb-1 text-[10px] font-extrabold tracking-widest text-slate-500 uppercase">
            Appréciation de cet examen
          </p>
          <p className="text-xs leading-relaxed whitespace-pre-wrap">
            {data.appreciation}
          </p>
        </div>
        <ExamReportSignatures />
        <ExamReportFooter data={data} organization={organization} />
      </div>
    </div>
  );
}


