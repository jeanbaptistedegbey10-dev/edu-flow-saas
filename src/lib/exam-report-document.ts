/**
 * Document HTML autonome du BULLETIN D'EXAMEN (telechargement).
 * Meme charte que l'apercu React (`exam-report-sheet.tsx`) et que le bulletin
 * récapitulatif premium : en-tete, filigrane, tableau modulaire, signatures,
 * pied de page. `@page A4` + `print-color-adjust: exact`.
 *
 * Ce document est RESTREINT à une session d'évaluation précise : ni
 * historique des autres examens, ni donnees financieres ni procedure de
 * voyage — le récapitulatif complet reste réservé à la fiche étudiant.
 */
import type { ExamReportData } from "@/lib/exam-report";
import type { PremiumReportOrganization } from "@/lib/premium-report";
import {
  formatOrganizationAddress,
  formatScore,
  formatScoreOnScale,
} from "@/lib/premium-report";
import { buildAttendanceSectionHtml } from "@/lib/report-attendance";

const AMP = String.fromCharCode(38);
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);
const DQ = String.fromCharCode(34);
const SQ = String.fromCharCode(39);

function esc(value: string): string {
  return value
    .replace(new RegExp(AMP, "g"), `${AMP}amp;`)
    .replace(new RegExp(LT, "g"), `${AMP}lt;`)
    .replace(new RegExp(GT, "g"), `${AMP}gt;`)
    .replace(new RegExp(DQ, "g"), `${AMP}quot;`)
    .replace(new RegExp(SQ, "g"), `${AMP}#39;`);
}

const frDate = new Intl.DateTimeFormat("fr-FR", {
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

const STYLES = [
  "@page { size: A4 portrait; margin: 8mm 10mm; }",
  "* { box-sizing: border-box; }",
  "html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; }",
  "body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #0f172a;",
  " background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }",
  ".sheet { position: relative; width: 100%; max-width: 190mm; margin: 0 auto;",
  " padding: 10mm 9mm 8mm; background: #ffffff; overflow: hidden;",
  " box-sizing: border-box; display: flex; flex-direction: column;",
  " justify-content: space-between; page-break-after: avoid;",
  " page-break-inside: avoid; }",
  ".watermark { position: absolute; inset: 0; display: flex; align-items: center;",
  " justify-content: center; pointer-events: none; z-index: 0; }",
  ".watermark span { font-size: 150px; font-weight: 800; color: #eef2ff;",
  " opacity: 0.55; transform: rotate(-18deg); letter-spacing: 0.05em; }",
  ".inner { position: relative; z-index: 1; }",
  ".header { display: flex; justify-content: space-between; align-items: flex-start;",
  " gap: 16px; padding-bottom: 10px; border-bottom: 3px solid #3730a3; }",
  ".left { width: 55%; display: flex; flex-direction: column;",
  " align-items: flex-start; gap: 4px; }",
  ".right { width: 40%; text-align: right; display: flex; flex-direction: column;",
  " align-items: flex-end; gap: 8px; }",
  ".logo { display: block; max-width: 220px; max-height: 64px;",
  " object-fit: contain; object-position: left center; }",
  ".mono { width: 52px; height: 52px; display: flex; align-items: center;",
  " justify-content: center; font-size: 24px; font-weight: 800; color: #fff;",
  " background: linear-gradient(135deg, #4f46e5, #3730a3); border-radius: 12px; }",
  ".school { font-size: 18px; font-weight: 800; color: #1e1b4b; margin: 0; }",
  ".base { font-size: 11px; color: #475569; margin: 0; }",
  ".contact { font-size: 11px; color: #475569; line-height: 1.6; margin: 0; }",
  ".title { display: inline-block; margin: 0; padding: 6px 12px;",
  " font-size: 13px; font-weight: 800; letter-spacing: 0.08em;",
  " text-transform: uppercase; color: #fff;",
  " background: linear-gradient(135deg, #4f46e5, #3730a3); border-radius: 6px; }",
  ".num { font-size: 11px; color: #334155; margin: 0; }",
  ".card { padding: 10px 12px; border: 1px solid #c7d2fe; border-radius: 8px; background: #f8faff; }",
  ".grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 14px; }",
  ".f { font-size: 11.5px; color: #334155; }",
  ".f strong { display: block; font-size: 10px; text-transform: uppercase;",
  " letter-spacing: 0.08em; color: #64748b; }",
  ".st { font-size: 12px; font-weight: 800; text-transform: uppercase;",
  " letter-spacing: 0.08em; color: #3730a3; margin: 12px 0 6px; }",
  "table.g { width: 100%; border-collapse: collapse; font-size: 12px; }",
  "table.g thead th { background: #1e1b4b; color: #fff; padding: 6px 8px;",
  " font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;",
  " text-align: left; }",
  "table.g thead th.n { text-align: right; }",
  "table.g thead th.c { text-align: center; }",
  "table.g td { padding: 5px 8px; border-bottom: 1px solid #eef2f7; }",
  "table.g tbody tr:nth-child(even) td { background: #f8fafc; }",
  "table.g td.n { text-align: right; font-weight: 700; white-space: nowrap; }",
  "table.g td.c { text-align: center; }",
  "table.g td small { color: #9ca3af; font-size: 9.5px; display: block; }",
  "tr.total td { background: #eef2ff !important; font-weight: 800;",
  " border-top: 2px solid #3730a3; }",
  ".dec { display: inline-block; padding: 2px 10px; border-radius: 999px;",
  " font-size: 11px; font-weight: 800; background: #d1fae5; color: #065f46; }",
  ".dec.bad { background: #fee2e2; color: #991b1b; }",
  ".dec.wait { background: #f3f4f6; color: #6b7280; }",
  ".dec.mid { background: #fef3c7; color: #92400e; }",
  ".note { font-size: 10px; color: #9ca3af; margin: 4px 0 0; }",
  ".att { margin-top: 12px; }",
  ".kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }",
  ".kpi { padding: 6px 8px; border-radius: 8px; text-align: center;",
  " border: 1px solid rgba(15, 23, 42, 0.08); }",
  ".kpi strong { display: block; font-size: 13px; font-weight: 800; }",
  ".kpi span { display: block; margin-top: 2px; font-size: 9.5px;",
  " font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }",
  ".app { margin-top: 12px; padding: 10px 12px; border: 1px solid #e5e7eb;",
  " border-left: 4px solid #3730a3; border-radius: 8px; background: #fafafa; }",
  ".app .lab { margin: 0 0 4px; font-size: 10px; font-weight: 800;",
  " text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; }",
  ".app p { margin: 0; font-size: 12px; line-height: 1.55; white-space: pre-wrap; }",
  ".sig { display: flex; gap: 16px; margin-top: 12px; }",
  ".box { position: relative; flex: 1; height: 64px;",
  " border: 1px dashed #9ca3af; border-radius: 8px; }",
  ".box span { position: absolute; top: 8px; left: 12px;",
  " font-size: 10px; color: #6b7280; }",
  ".foot { margin-top: 14px; padding-top: 8px; border-top: 1px solid #d1d5db;",
  " text-align: center; }",
  ".foot p { margin: 2px 0; font-size: 10px; color: #9ca3af; }",
  ".foot p.leg { font-size: 10px; color: #6b7280; }",
].join("\n");


export function buildExamReportDocument(
  data: ExamReportData,
  organization: PremiumReportOrganization
): string {
  const studentName =
    `${data.studentFirstName} ${data.studentLastName}`.trim() || "—";
  const addressLine = formatOrganizationAddress(organization);

  const contacts = [
    organization.phone ? `Tél. : ${esc(organization.phone)}` : null,
    organization.email ? `Email : ${esc(organization.email)}` : null,
    organization.website ? `Site web : ${esc(organization.website)}` : null,
  ].filter((c): c is string => c !== null);

  const logo = organization.logoUrl
    ? `<img class="logo" src="${esc(organization.logoUrl)}" alt="Logo de l'établissement" />`
    : `<div class="mono">${esc(organization.name.trim().charAt(0).toUpperCase() || "C")}</div>`;

  const head = [
    "<!DOCTYPE html>",
    '<html lang="fr">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>Bulletin d'examen ${esc(data.documentNumber)}</title>`,
    `<style>${STYLES}</style>`,
    "</head>",
    "<body>",
    '<main class="sheet">',
    '<div class="watermark" aria-hidden="true"><span>EXAMEN</span></div>',
    '<div class="inner">',
  ].join("\n");

  const header = [
    '<header class="header">',
    `<div class="left">${logo}<p class="school">${esc(organization.name)}</p>${addressLine ? `<p class="base">${esc(addressLine)}</p>` : ""}</div>`,
    `<div class="right"><span class="title">Bulletin d'examen</span>${contacts.length > 0 ? `<p class="contact">${contacts.join("<br />")}</p>` : ""}<p class="num">N° ${esc(data.documentNumber)}</p></div>`,
    "</header>",
  ].join("\n");

  const card = [
    '<section class="card"><div class="grid">',
    `<div class="f"><strong>Élève</strong>${esc(studentName)}</div>`,
    `<div class="f"><strong>Matricule</strong>${esc(data.studentCode)}</div>`,
    `<div class="f"><strong>Examen</strong>${esc(data.evaluationTitle)}</div>`,
    `<div class="f"><strong>Date de l'examen</strong>${esc(frDateShort.format(data.evaluationDate))}</div>`,
    `<div class="f"><strong>Période / Semestre</strong>${esc(data.periodLabel ?? "—")}</div>`,
    `<div class="f"><strong>Classe / Groupe</strong>${esc(data.className)}</div>`,
    `<div class="f"><strong>Cours</strong>${esc(`${data.courseTitle} (${data.courseCode})`)}</div>`,
    `<div class="f"><strong>Professeur responsable</strong>${esc(data.teacherName ?? "—")}</div>`,
    "</div></section>",
  ].join("\n");

  const verdict =
    data.gradedModules === 0
      ? { cls: "dec wait", label: "En attente de notes" }
      : data.validatedModules === data.gradedModules
        ? { cls: "dec", label: "Examen validé" }
        : data.validatedModules === 0
          ? { cls: "dec bad", label: "Examen non validé" }
          : {
              cls: "dec mid",
              label: `${data.validatedModules} / ${data.gradedModules} validés`,
            };

  const rowsHtml =
    data.rows.length === 0
      ? `<tr><td colspan="4" style="text-align:center;color:#9ca3af;">Aucun module configuré pour cet examen.</td></tr>`
      : data.rows
          .map(
            (row) =>
              `<tr><td>${esc(row.module)}<small>Seuil de validation : ${esc(formatScore(row.passingScore))}</small></td><td class="n">${esc(formatScore(row.maxScore))}</td><td class="n">${esc(formatScoreOnScale(row.score, row.maxScore))}</td><td class="c">${row.passed === true ? '<span class="dec">Validé</span>' : row.passed === false ? '<span class="dec bad">Non validé</span>' : '<span class="dec wait">Non noté</span>'}</td></tr>`
          )
          .join("\n");

  const table = [
    '<h2 class="st">Modules évalués à cet examen</h2>',
    '<table class="g"><thead><tr><th>Module</th><th class="n">Barème</th><th class="n">Note obtenue</th><th class="c">Statut</th></tr></thead>',
    `<tbody>${rowsHtml}`,
    `<tr class="total"><td>Modules validés</td><td></td><td class="n">${data.gradedModules > 0 ? `${data.validatedModules} / ${data.gradedModules}` : "—"}</td><td class="c"><span class="${verdict.cls}">${verdict.label}</span></td></tr>`,
    "</tbody></table>",
    `<p class="note">Bulletin restreint à l'examen « ${esc(data.evaluationTitle)} » — le récapitulatif complet de l'année est disponible dans la fiche de l'étudiant.</p>`,
  ].join("\n");

  const tail = [
    // Assiduité / Présences : AU-DESSUS de la zone d'appréciation.
    buildAttendanceSectionHtml(data.attendance),
    `<div class="app"><p class="lab">Appréciation de cet examen</p><p>${esc(data.appreciation)}</p></div>`,
    '<section class="sig">',
    '<div class="box"><span>Signature de l\u2019enseignant</span></div>',
    '<div class="box"><span>Signature de la direction + cachet</span></div>',
    "</section>",
    '<footer class="foot">',
    `<p>Document N° ${esc(data.documentNumber)} — généré le ${esc(frDate.format(data.issuedAt))} · vérifiable auprès de ${esc(organization.name)}${organization.phone ? ` · ${esc(organization.phone)}` : ""}.</p>`,
    "<p>Toute reproduction sans le cachet officiel est sans valeur. Document strictement confidentiel.</p>",
    "</footer>",
    "</div></main></body></html>",
  ].join("\n");

  return [head, header, card, table, tail].join("\n");
}

