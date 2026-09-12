"use client";

import * as React from "react";

import type {
  PremiumAttendanceSummary,
  PremiumFinancialSummary,
  PremiumPaymentEntry,
  PremiumReportData,
  PremiumReportOrganization,
  PremiumTravelSummary,
} from "@/lib/premium-report";
import { formatOrganizationAddress, formatScore, formatScoreOnScale } from "@/lib/premium-report";

/**
 * Feuille A4 « bulletin / rapport » partagee entre la modale d'apercu
 * (`ReportCardDialog`) et la page publique du lien parent.
 *
 * DEUX NIVEAUX DE DOCUMENT :
 * - scope "academic" → BULLETIN ACADÉMIQUE (enseignant / parent) : en-tête,
 *   cartouche élève, évaluations modulaires (note sur barème + Validé /
 *   Non validé), assiduité, appréciation de l'enseignant, signatures.
 *   AUCUNE donnée financière ni de procédure de voyage.
 * - scope "global" → RAPPORT GLOBAL (admin / staff) : toutes les sections
 *   du bulletin + récapitulatif financier détaillé (avec historique des
 *   versements) + section procédure de voyage (étapes + règlements).
 *
 * `#print-area` est la seule zone imprimee : le CSS d'impression scoped
 * (`body.report-printing`) masque tout le reste de la page puis rend la
 * zone visible. Parfait pour `window.print()` sans iframe.
 */

export const PREMIUM_REPORT_PRINT_CSS = [
  "@page { size: A4 portrait; margin: 8mm 10mm; }",
  "@media print {",
  "  html, body {",
  "    height: 100%;",
  "    margin: 0 !important;",
  "    padding: 0 !important;",
  "    overflow: hidden !important;",
  "  }",
  "  body.report-printing { background: #ffffff !important; }",
  "  body.report-printing * { visibility: hidden !important; }",
  "  body.report-printing [data-slot='dialog-overlay'] {",
  "    display: none !important;",
  "  }",
  "  body.report-printing [data-slot='dialog-content'] {",
  "    position: static !important; inset: auto !important; transform: none !important;",
  "    overflow: visible !important; max-width: none !important; max-height: none !important;",
  "    margin: 0 !important; padding: 0 !important; border: none !important;",
  "    border-radius: 0 !important; box-shadow: none !important; background: transparent !important;",
  "  }",
  "  body.report-printing #print-area,",
  "  body.report-printing #print-area * { visibility: visible !important; }",
  "  body.report-printing #print-area {",
  "    position: static !important; width: 100% !important; margin: 0 auto !important;",
  "    max-width: 190mm !important;",
  "    height: 275mm !important; max-height: 275mm !important;",
  "    box-sizing: border-box !important;",
  "    display: flex !important; flex-direction: column !important;",
  "    justify-content: space-between !important;",
  "    overflow: hidden !important;",
  "    -webkit-print-color-adjust: exact !important;",
  "    print-color-adjust: exact !important;",
  "    page-break-after: avoid !important;",
  "    break-after: avoid !important;",
  "    page-break-inside: avoid !important;",
  "  }",
  "  /* Distribution verticale : les sections du rapport s'etalent sur la",
  "     hauteur utile de la feuille et le pied de page reste ancre en bas. */",
  "  body.report-printing #print-area .report-body {",
  "    display: flex !important; flex-direction: column !important;",
  "    justify-content: space-between !important;",
  "    flex: 1 0 auto !important;",
  "  }",
  "  /* Protection contre le saucissonnage des sections a cheval sur",
  "     deux pages. */",
  "  body.report-printing #print-area .print-section,",
  "  body.report-printing #print-area .avoid-break {",
  "    break-inside: avoid !important;",
  "    page-break-inside: avoid !important;",
  "  }",
  "}",
].join("\n");

/** Injecte le CSS d'impression scoped (aucune fuite globale). */
export function usePremiumReportPrintCss(): void {
  React.useEffect(() => {
    const el = document.createElement("style");
    el.setAttribute("data-report-print", "true");
    el.textContent = PREMIUM_REPORT_PRINT_CSS;
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, []);
}

/** Pose la classe `body.report-printing` (scoped) puis lance `window.print()`. */
export function triggerPremiumReportPrint(): void {
  document.body.classList.add("report-printing");
  const cleanup = (): void => {
    document.body.classList.remove("report-printing");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.setTimeout(() => {
    window.print();
    window.setTimeout(cleanup, 1000);
  }, 60);
}
// --------------------------------------
// Helpers visuels
// --------------------------------------

const frNumber = new Intl.NumberFormat("fr-FR");

function formatFcfa(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount)) return "—";
  return `${frNumber.format(Math.round(amount))} FCFA`;
}

const entryDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Historique chronologique des versements (rapport global uniquement). */
function PaymentHistoryTable({
  entries,
  tone,
}: {
  entries: PremiumPaymentEntry[];
  /** Palette d'accent de l'en-tête du tableau (indigo = formation, teal = voyage). */
  tone: "indigo" | "teal";
}): React.ReactElement {
  const headerClass =
    tone === "teal"
      ? "bg-teal-800 text-white"
      : "bg-indigo-950 text-white";
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-slate-200">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr
            className={`text-left text-[10px] tracking-wide uppercase ${headerClass}`}
          >
            <th className="px-3 py-1.5 font-bold">Date</th>
            <th className="px-3 py-1.5 font-bold">Mode de paiement</th>
            <th className="px-3 py-1.5 text-right font-bold">Montant</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td
                colSpan={3}
                className="px-3 py-2.5 text-center text-slate-400"
              >
                Aucun versement enregistré.
              </td>
            </tr>
          ) : (
            entries.map((entry, index) => (
              <tr
                key={`${entry.paidAt.toISOString()}-${index}`}
                className="border-t border-slate-100 odd:bg-white even:bg-slate-50"
              >
                <td className="px-3 py-1.5 tabular-nums text-slate-600">
                  {entryDateFormatter.format(entry.paidAt)}
                </td>
                <td className="px-3 py-1.5 text-slate-600">
                  {entry.method}
                  {entry.reference ? (
                    <span className="ml-1.5 text-[10px] text-slate-400">
                      ({entry.reference})
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-1.5 text-right font-bold tabular-nums text-slate-800">
                  {formatFcfa(entry.amount)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function InitialBadge({ name }: { name: string }): React.ReactElement {
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

function ReportHeader({
  organization,
  documentNumber,
  scope,
}: {
  organization: PremiumReportOrganization;
  documentNumber: string;
  /** Portee du document : bulletin academique ou rapport global. */
  scope: PremiumReportData["scope"];
}): React.ReactElement {
  const address = formatOrganizationAddress(organization);
  const badgeLabel =
    scope === "global"
      ? "Rapport global administratif"
      : "Bulletin académique";
  return (
    <header className="flex w-full items-start justify-between gap-4 border-b-[3px] border-indigo-900 pb-3">
      {/* Bloc gauche (Branding) : logo, nom de l'établissement puis adresse,
          empilés strictement — aucun sous-titre ni espace parasite. */}
      <div className="flex w-[55%] flex-col items-start gap-1">
        {organization.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={organization.logoUrl}
            alt="Logo de l'établissement"
            className="block h-12 w-auto max-w-[220px] object-contain object-left"
          />
        ) : (
          <InitialBadge name={organization.name} />
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
          {badgeLabel}
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
// Cartouche eleve
// --------------------------------------

function ReportStudentCard({
  data,
  studentName,
}: {
  data: PremiumReportData;
  studentName: string;
}): React.ReactElement {
  // Cartouche élève : STRICTEMENT académique (aucune donnée financière).
  const fields: Array<[string, string]> = [
    ["Élève", studentName],
    ["Matricule", data.studentCode],
    ["Période / Semestre", data.periodLabel],
    ["Classe / Groupe", data.className ?? "—"],
    ["Cours", data.courseTitle ?? "—"],
    ["Professeur responsable", data.teacherName ?? "—"],
  ];
  return (
    <section className="avoid-break print-section mt-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
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
// Tableau des notes
// --------------------------------------

function ReportGradesTable({
  data,
}: {
  data: PremiumReportData;
}): React.ReactElement {
  const entryDateFormatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <div>
      <h3 className="mt-3 mb-1 text-xs font-extrabold tracking-widest text-indigo-800 uppercase">
        Évaluations modulaires
      </h3>
      <div className="avoid-break print-section overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-indigo-950 text-left text-[11px] tracking-wide text-white uppercase">
              <th className="px-3 py-1.5 font-bold">Évaluation / Module</th>
              <th className="px-3 py-1.5 font-bold">Date</th>
              <th className="px-3 py-1.5 text-right font-bold">Note (barème)</th>
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
                  Aucune note saisie pour cette période.
                </td>
              </tr>
            ) : (
              data.rows.map((row, index) => (
                <tr
                  key={`${row.evaluationTitle}-${row.module}-${index}`}
                  className="border-t border-slate-100 odd:bg-white even:bg-slate-50"
                >
                  <td className="px-3 py-1.5">
                    <span className="block font-medium">
                      {row.evaluationTitle} — {row.module}
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      Seuil de validation : {formatScore(row.passingScore)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-slate-600">
                    {row.date ? entryDateFormatter.format(row.date) : "—"}
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
              ))
            )}
            {/* Résumé modulaire : validation module par module (PAS de moyenne
                générale ni de coefficient — validation indépendante). */}
            <tr className="border-t-2 border-indigo-900 bg-indigo-50 font-extrabold">
              <td className="px-3 py-1.5">Modules validés</td>
              <td className="px-3 py-1.5 tabular-nums" />
              <td className="px-3 py-1.5 text-right tabular-nums">
                {data.gradedModules > 0
                  ? `${data.validatedModules} / ${data.gradedModules}`
                  : "—"}
              </td>
              <td className="px-3 py-1.5 text-center">
                {data.gradedModules > 0 && data.validatedModules === data.gradedModules ? (
                  <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800">
                    Formation validée
                  </span>
                ) : (
                  <span className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-extrabold text-slate-600">
                    En cours
                  </span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
// --------------------------------------
// Resume d'assiduite
// --------------------------------------

function AttendanceCounter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}): React.ReactElement {
  return (
    <div
      className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg border px-2 py-1.5 ${tone}`}
    >
      <span className="text-sm font-extrabold tabular-nums">{value}</span>
      <span className="text-[9.5px] font-semibold text-slate-500 uppercase tracking-wide">
        {label}
      </span>
    </div>
  );
}

function ReportAttendanceSummary({
  attendance,
}: {
  attendance: PremiumAttendanceSummary;
}): React.ReactElement {
  return (
    <div className="avoid-break print-section mt-3">
      <h3 className="mb-1.5 text-xs font-extrabold tracking-widest text-indigo-800 uppercase">
        Résumé d&apos;assiduité
      </h3>
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-2.5">
        <div className="flex flex-col items-center rounded-lg bg-indigo-950 px-2.5 py-1.5 text-white">
          <span className="text-sm font-extrabold tabular-nums">
            {attendance.total}
          </span>
          <span className="text-[9.5px] font-semibold uppercase tracking-wide opacity-90">
            Total
          </span>
        </div>
        <AttendanceCounter
          label="Présences"
          value={attendance.present}
          tone="border-emerald-200 bg-emerald-50 text-emerald-700"
        />
        <AttendanceCounter
          label="Retards"
          value={attendance.late}
          tone="border-amber-200 bg-amber-50 text-amber-700"
        />
        <AttendanceCounter
          label="Absences"
          value={attendance.absent}
          tone="border-red-200 bg-red-50 text-red-700"
        />
        <AttendanceCounter
          label="Excusées"
          value={attendance.excused}
          tone="border-sky-200 bg-sky-50 text-sky-700"
        />
      </div>
    </div>
  );
}

// --------------------------------------
// Recapitulatif financier detaille (RAPPORT GLOBAL uniquement)
// --------------------------------------

function ReportFinancialSummary({
  financial,
}: {
  financial: PremiumFinancialSummary;
}): React.ReactElement {
  const remainingTone =
    financial.remaining === null
      ? "text-slate-600"
      : financial.remaining > 0
        ? "text-red-700"
        : "text-emerald-700";
  return (
    <div className="avoid-break print-section mt-3 rounded-lg border border-slate-200 p-3">
      <h3 className="mb-1.5 text-xs font-extrabold tracking-widest text-indigo-800 uppercase">
        Récapitulatif financier
      </h3>
      <dl className="grid grid-cols-4 gap-x-4 gap-y-1 text-[11.5px]">
        <div>
          <dt className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Prix formation
          </dt>
          <dd className="tabular-nums text-slate-700">
            {formatFcfa(financial.totalCost)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Réduction
          </dt>
          <dd className="tabular-nums text-slate-700">
            {financial.discountLabel ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Montant payé
          </dt>
          <dd className="tabular-nums text-emerald-700">
            {formatFcfa(financial.amountPaid)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Reste à payer
          </dt>
          <dd className={`font-bold tabular-nums ${remainingTone}`}>
            {financial.remaining !== null && financial.remaining === 0
              ? "Soldé"
              : formatFcfa(financial.remaining)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 mb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
        Historique des versements
      </p>
      <PaymentHistoryTable entries={financial.history} tone="indigo" />
    </div>
  );
}
// --------------------------------------
// Procedure de voyage (RAPPORT GLOBAL uniquement)
// --------------------------------------

function ReportTravelSection({
  travel,
}: {
  travel: PremiumTravelSummary;
}): React.ReactElement {
  const remainingTone =
    travel.remaining === null
      ? "text-slate-600"
      : travel.remaining > 0
        ? "text-red-700"
        : "text-emerald-700";
  return (
    <div className="avoid-break print-section mt-3 rounded-lg border border-teal-200 bg-teal-50/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-extrabold tracking-widest text-teal-800 uppercase">
          Procédure de voyage
        </h3>
        <p className="text-[11px] font-semibold text-teal-800">
          {travel.destination}
          {travel.targetProgram ? ` — ${travel.targetProgram}` : ""}
          <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-extrabold">
            {travel.statusLabel}
          </span>
        </p>
      </div>

      {/* Avancement : etapes validees du dossier */}
      {travel.steps.length > 0 ? (
        <ol className="mt-2 flex flex-wrap gap-1.5">
          {travel.steps.map((step) => (
            <li
              key={step.label}
              className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
                step.validated
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              {step.validated ? "✓ " : ""}
              {step.label}
            </li>
          ))}
        </ol>
      ) : null}
      <p className="mt-1.5 text-[10.5px] text-slate-600">
        Avancement :{" "}
        <span className="font-bold tabular-nums">
          {travel.validatedSteps} / {travel.totalSteps}
        </span>{" "}
        étapes validées
      </p>

      <dl className="mt-2 grid grid-cols-4 gap-x-4 gap-y-1 text-[11.5px]">
        <div>
          <dt className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Coût du dossier
          </dt>
          <dd className="tabular-nums text-slate-700">
            {formatFcfa(travel.totalCost)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Réduction
          </dt>
          <dd className="tabular-nums text-slate-700">
            {travel.discount !== null ? formatFcfa(travel.discount) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Montant payé
          </dt>
          <dd className="tabular-nums text-emerald-700">
            {formatFcfa(travel.amountPaid)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
            Reste à payer
          </dt>
          <dd className={`font-bold tabular-nums ${remainingTone}`}>
            {travel.remaining !== null && travel.remaining === 0
              ? "Soldé"
              : formatFcfa(travel.remaining)}
          </dd>
        </div>
      </dl>
      <p className="mt-2 mb-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
        Historique des règlements (procédure de voyage)
      </p>
      <PaymentHistoryTable entries={travel.history} tone="teal" />
    </div>
  );
}
// --------------------------------------
// Signatures & pied de page
// --------------------------------------

function ReportSignatures(): React.ReactElement {
  // Zones de signature EPUREES : uniquement des encadres pointilles vides,
  // destines a recevoir la signature manuscrite et le cachet physique APRES
  // impression. Aucun faux tampon / visa en filigrane.
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

function ReportFooter({
  data,
  organization,
}: {
  data: PremiumReportData;
  organization: PremiumReportOrganization;
}): React.ReactElement {
  const legal = [organization.rccm, organization.ifu]
    .filter((p): p is string => p !== null && p.trim().length > 0)
    .join(" · ");
  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return (
    <footer className="print-section mt-3 border-t border-slate-300 pt-2 text-center">
      {legal ? (
        <p className="text-[10px] text-slate-500">{legal}</p>
      ) : null}
      <p className="mt-0.5 text-[10px] text-slate-400">
        Document N° {data.documentNumber} — généré le{" "}
        {dateFormatter.format(data.issuedAt)} · vérifiable auprès de{" "}
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

export function PremiumReportSheet({
  data,
  organization,
}: {
  data: PremiumReportData;
  organization: PremiumReportOrganization;
}): React.ReactElement {
  const studentName =
    `${data.studentFirstName} ${data.studentLastName}`.trim() || "—";
  const isGlobal = data.scope === "global";

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
          {isGlobal ? "RAPPORT" : "BULLETIN"}
        </span>
      </div>
      <div className="print-section report-body relative z-10">
        <ReportHeader
          organization={organization}
          documentNumber={data.documentNumber}
          scope={data.scope}
        />
        <ReportStudentCard data={data} studentName={studentName} />
        <ReportGradesTable data={data} />
        {data.attendance !== null ? (
          <ReportAttendanceSummary attendance={data.attendance} />
        ) : null}
        {/* Sections financières + procédure de voyage : RAPPORT GLOBAL
            (admin / staff) uniquement. Le bulletin académique de
            l'enseignant n'en contient AUCUNE. */}
        {data.financial !== null ? (
          <ReportFinancialSummary financial={data.financial} />
        ) : null}
        {data.travel !== null ? (
          <ReportTravelSection travel={data.travel} />
        ) : null}
        <div className="avoid-break print-section mt-3 rounded-lg border border-slate-200 border-l-4 border-l-indigo-800 bg-slate-50 p-3">
          <p className="mb-1 text-[10px] font-extrabold tracking-widest text-slate-500 uppercase">
            Appréciation / Recommandations de l&apos;enseignant
          </p>
          <p className="text-xs leading-relaxed whitespace-pre-wrap">
            {data.generalAppreciation}
          </p>
        </div>
        <ReportSignatures />
        <ReportFooter data={data} organization={organization} />
      </div>
    </div>
  );
}