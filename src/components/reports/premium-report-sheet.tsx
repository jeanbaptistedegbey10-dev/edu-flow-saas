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
import { computeAttendanceMetrics } from "@/lib/report-attendance";
import { ReportAttendanceBlock } from "@/components/reports/report-attendance-block";

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

/**
 * CSS d'impression SCOPÉ au bulletin (`body.report-printing`), injecté à la
 * demande (hook `usePremiumReportPrintCss`) : aucune fuite sur l'écran.
 *
 * Ordre des règles :
 * 1. `@page A4` + marges : le document imprimé a la taille d'une feuille.
 * 2. LE CHROME HORS BULLETIN EST SORTI DU FLUX (`display: none !important`) :
 *    barre latérale, en-tête du tableau de bord, bandeau de licence, boutons
 *    de la modale. Sans cela, l'aperçu navigateur rogne la feuille (contenu
 *    affiché « en haut à gauche », colonnes et en-tête absents).
 * 3. LES CONTENEURS PORTEURS SONT NEUTRALISÉS (`position: static`, largeur
 *    100 %, marges nulles, `overflow: visible`) : la zone du bulletin sort du
 *    flux flottant de la modale Radix et occupe tout le document.
 * 4. `#print-area` est visible ET ancré sur la page (largeur 100 %, marge 0,
 *    débordement visible, hauteur libre) : logo, en-tête établissement, toutes
 *    les colonnes du tableau et les blocs de bas de page (assiduité,
 *    appréciation, signatures) tiennent sur une page A4 propre.
 *
 * AUCUNE hauteur fixe ni `overflow: hidden` n'est imposée : ces deux règles
 * étaient la cause du contenu tronqué (le bulletin dépassant la feuille, la
 * partie basse était purement et simplement coupée).
 */
export const PREMIUM_REPORT_PRINT_CSS = [
  "@page { size: A4 portrait; margin: 8mm 10mm; }",
  "@media print {",
  // 1. Racine du document : plus aucune contrainte de hauteur / debordement.
  //    Selecteur `html body.report-printing` (et non `body.…`) : il l'emporte
  //    sur les regles `!important` injectees par le verrou de defilement de
  //    la modale Radix (`body { overflow: hidden; padding-right: … }`), qui
  //    rognaient le document imprime.
  "  html body.report-printing,",
  "  html body,",
  "  html {",
  "    height: auto !important;",
  "    min-height: 0 !important;",
  "    margin: 0 !important;",
  "    padding: 0 !important;",
  "    background: #ffffff !important;",
  "    overflow: visible !important;",
  "  }",
  "  body.report-printing { background: #ffffff !important; }",
  // 2. TOUT invisible sauf #print-area (repris plus bas) ; animations et
  //    transitions neutralisees pour ne pas perturber la mise en page.
  "  body.report-printing * {",
  "    visibility: hidden !important;",
  "    animation: none !important;",
  "    transition: none !important;",
  "  }",
  // 3. Chrome applicatif HORS bulletin : sorti du flux (display: none).
  //    Selecteurs targets : ils n'apparaissent jamais dans #print-area
  //    (le `header` de l'etablissement du bulletin n'est donc pas touche).
  "  body.report-printing [data-slot='sidebar-wrapper'],",
  "  body.report-printing [data-slot='sidebar'],",
  "  body.report-printing [data-slot='sidebar-inset'],",
  "  body.report-printing [data-slot='sidebar-trigger'],",
  "  body.report-printing [data-slot='sidebar-rail'],",
  "  body.report-printing [data-slot='dialog-overlay'],",
  "  body.report-printing [data-slot='dialog-header'],",
  "  body.report-printing [data-slot='dialog-footer'],",
  "  body.report-printing [data-slot='dialog-close'],",
  "  body.report-printing [data-slot='dialog-trigger'],",
  "  body.report-printing [data-print-hide],",
  "  body.report-printing nav,",
  "  body.report-printing aside,",
  "  body.report-printing button,",
  "  body.report-printing input,",
  "  body.report-printing textarea,",
  "  body.report-printing select { display: none !important; }",
  // 4. Conteneurs porteurs de la modale : remis dans le flux normal, pleine
  //    largeur, sans contrainte de dimensions ni de decoupe.
  "  body.report-printing [data-slot='dialog-content'],",
  "  body.report-printing [data-print-shell] {",
  "    position: static !important;",
  "    inset: auto !important;",
  "    transform: none !important;",
  "    display: block !important;",
  "    width: 100% !important;",
  "    max-width: none !important;",
  "    height: auto !important;",
  "    min-height: 0 !important;",
  "    max-height: none !important;",
  "    overflow: visible !important;",
  "    margin: 0 !important;",
  "    padding: 0 !important;",
  "    gap: 0 !important;",
  "    border: none !important;",
  "    border-radius: 0 !important;",
  "    box-shadow: none !important;",
  "    background: transparent !important;",
  "  }",
  // 5. Zone du bulletin : seule zone visible, ancree sur toute la page.
  "  body.report-printing #print-area,",
  "  body.report-printing #print-area * { visibility: visible !important; }",
  "  body.report-printing #print-area {",
  "    position: static !important;",
  "    display: block !important;",
  "    width: 100% !important;",
  "    max-width: none !important;",
  "    height: auto !important;",
  "    min-height: 0 !important;",
  "    max-height: none !important;",
  "    margin: 0 !important;",
  "    padding: 0 !important;",
  "    overflow: visible !important;",
  "    border: none !important;",
  "    border-radius: 0 !important;",
  "    box-shadow: none !important;",
  "    background: #ffffff !important;",
  "  }",
  // 6. Couleurs / fonds (logo, en-tete indigo, badges de statut) conserves.
  "  body.report-printing #print-area * {",
  "    -webkit-print-color-adjust: exact !important;",
  "    print-color-adjust: exact !important;",
  "  }",
  // 7. Tableaux : toutes les colonnes visibles, en-tete repete si le tableau
  //    deborde, lignes jamais coupees en deux.
  "  body.report-printing #print-area table {",
  "    width: 100% !important;",
  "    max-width: none !important;",
  "    border-collapse: collapse !important;",
  "    overflow: visible !important;",
  "  }",
  "  body.report-printing #print-area thead {",
  "    display: table-header-group !important;",
  "  }",
  "  body.report-printing #print-area tfoot {",
  "    display: table-row-group !important;",
  "  }",
  "  body.report-printing #print-area tr,",
  "  body.report-printing #print-area td,",
  "  body.report-printing #print-area th {",
  "    overflow: visible !important;",
  "    break-inside: avoid !important;",
  "    page-break-inside: avoid !important;",
  "  }",
  // 8. Protection contre le saucissonnage des sections a cheval sur deux
  //    pages (en-tete, cartouche, tableau, assiduite, appreciation,
  //    signatures, pied de page).
  "  body.report-printing #print-area .print-section,",
  "  body.report-printing #print-area .avoid-break {",
  "    break-inside: avoid !important;",
  "    page-break-inside: avoid !important;",
  "    break-after: avoid !important;",
  "    page-break-after: avoid !important;",
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

/**
 * Pose la classe `body.report-printing` (scoped) puis lance `window.print()`.
 *
 * La classe n'est retirée qu'une fois l'APERÇU d'impression réellement
 * terminé (`afterprint` ou sortie du media `print`) : la retirer trop tôt
 * (minuterie courte) faisait perdre le style d'impression au moment où le
 * navigateur compose la page, d'où les bulletins tronqués à l'écran.
 */
export function triggerPremiumReportPrint(): void {
  const body = document.body;
  body.classList.add("report-printing");

  const printMedia =
    typeof window.matchMedia === "function"
      ? window.matchMedia("print")
      : null;
  let cleaned = false;
  let timer: number | null = null;

  function handleMediaChange(event: MediaQueryListEvent): void {
    if (!event.matches) cleanup();
  }

  function cleanup(): void {
    if (cleaned) return;
    cleaned = true;
    body.classList.remove("report-printing");
    window.removeEventListener("afterprint", cleanup);
    printMedia?.removeEventListener("change", handleMediaChange);
    if (timer !== null) window.clearTimeout(timer);
  }

  window.addEventListener("afterprint", cleanup);
  printMedia?.addEventListener("change", handleMediaChange);

  // Filet de sécurité : si le navigateur n'émet aucun événement (certains
  // navigateurs annulent l'impression sans `afterprint`), on retire la classe
  // au bout de 60 s pour ne pas laisser la page figée en mode impression.
  timer = window.setTimeout(cleanup, 60_000);

  window.setTimeout(() => {
    window.print();
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

function ReportAttendanceSummary({
  attendance,
  className,
}: {
  attendance: PremiumAttendanceSummary;
  /** Classe analysée (légende du bloc). */
  className?: string | null;
}): React.ReactElement {
  // Les compteurs bruts sont convertis en métriques (séances présentes /
  // total, taux de présence en %, absences) par le helper partagé.
  const metrics = computeAttendanceMetrics({
    total: attendance.total,
    present: attendance.present,
    late: attendance.late,
    absent: attendance.absent,
    excused: attendance.excused,
  });

  if (metrics.totalSessions === 0) {
    return (
      <div className="avoid-break print-section mt-3">
        <h3 className="mb-1.5 text-xs font-extrabold tracking-widest text-indigo-800 uppercase">
          Assiduité / Présences
        </h3>
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-400">
          Aucune séance émargée pour cette période.
        </p>
      </div>
    );
  }

  return (
    <ReportAttendanceBlock
      metrics={metrics}
      caption={
        className
          ? `Suivi des émargements — classe ${className}.`
          : "Suivi des émargements de la période."
      }
    />
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
        {/* Assiduité / Présences : bloc positionné AU-DESSUS de la zone
            d'appréciation, lisible ET visible à l'impression. */}
        {data.attendance !== null ? (
          <ReportAttendanceSummary
            attendance={data.attendance}
            className={data.className}
          />
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