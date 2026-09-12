/**
 * Document HTML autonome du bulletin / rapport premium (telechargement).
 * Meme charte que l'apercu React : en-tete, filigrane, tableau modulaire,
 * signatures epurees, pied de page. `@page A4` + `print-color-adjust: exact`.
 *
 * DEUX NIVEAUX : bulletin academique (aucune donnee financiere) et rapport
 * global (financier + procedure de voyage, roles administratifs).
 */
import type {
  PremiumPaymentEntry,
  PremiumReportData,
  PremiumReportOrganization,
} from "@/lib/premium-report";
import {
  formatOrganizationAddress,
  formatScore,
  formatScoreOnScale,
} from "@/lib/premium-report";

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
  ".card { margin-top: 12px; padding: 10px 12px; border: 1px solid #e0e7ff;",
  " border-radius: 8px; background: #f8faff; }",
  ".grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 14px; }",
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
  "tr.total td { background: #eef2ff !important; font-weight: 800;",
  " border-top: 2px solid #3730a3; }",
  ".dec { display: inline-block; padding: 2px 10px; border-radius: 999px;",
  " font-size: 11px; font-weight: 800; background: #d1fae5; color: #065f46; }",
  ".dec.bad { background: #fee2e2; color: #991b1b; }",
  ".dec.wait { background: #f3f4f6; color: #6b7280; }",
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
  ".att { margin-top: 12px; }",
  ".att > p, .fin > p { margin: 0 0 6px; font-size: 10px; font-weight: 800;",
  " text-transform: uppercase; letter-spacing: 0.1em; color: #3730a3; }",
  ".att .row { display: flex; gap: 8px; align-items: stretch; }",
  ".att .cell { flex: 1; padding: 8px 0; border: 1px solid #e5e7eb;",
  " border-radius: 8px; text-align: center; }",
  ".att .cell b { display: block; font-size: 14px; font-weight: 800; }",
  ".att .cell small { display: block; font-size: 8.5px; text-transform: uppercase;",
  " letter-spacing: 0.06em; color: #6b7280; }",
  ".fin { margin-top: 10px; padding: 10px 12px; border: 1px solid #e5e7eb;",
  " border-radius: 8px; background: #fafafa; }",
  ".fin .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 14px; }",
  ".hist { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-top: 4px; }",
  ".hist thead th { background: #1e1b4b; color: #fff; padding: 5px 8px;",
  " font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; text-align: left; }",
  ".hist thead th.n { text-align: right; }",
  ".hist td { padding: 4px 8px; border-bottom: 1px solid #eef2f7; }",
  ".hist tbody tr:nth-child(even) td { background: #f8fafc; }",
  ".hist td.n { text-align: right; font-weight: 700; }",
  ".hist .ref { color: #9ca3af; font-size: 9px; }",
  ".travel { margin-top: 10px; padding: 10px 12px; border: 1px solid #99f6e4;",
  " border-radius: 8px; background: #f0fdfa; }",
  ".travel > p { margin: 0 0 6px; font-size: 10px; font-weight: 800;",
  " text-transform: uppercase; letter-spacing: 0.1em; color: #0f766e; }",
  ".travel .meta { display: flex; flex-wrap: wrap; justify-content: space-between;",
  " gap: 6px; font-size: 11.5px; font-weight: 700; color: #0f766e; }",
  ".steps { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 0; padding: 0;",
  " list-style: none; }",
  ".step { padding: 3px 8px; border: 1px solid #e5e7eb; border-radius: 6px;",
  " font-size: 10px; font-weight: 600; color: #9ca3af; background: #fff; }",
  ".step.done { border-color: #a7f3d0; background: #ecfdf5; color: #047857; }",
  ".progress { font-size: 10.5px; color: #334155; margin: 6px 0 0; }",
  "@media print { body { background: #fff; }",
  " .sheet { max-width: none; margin: 0; padding: 0;",
  "   height: 275mm; max-height: 275mm; box-sizing: border-box;",
  "   display: flex; flex-direction: column; justify-content: space-between;",
  "   overflow: hidden; }",
  " .inner { flex: 1 0 auto; display: flex; flex-direction: column;",
  "   justify-content: space-between; }",
  " .card, .att, .fin, .travel, .app, .sig, .foot {",
  "   break-inside: avoid; page-break-inside: avoid; } }",
].join("\n");

export function buildPremiumReportDocument(
  data: PremiumReportData,
  organization: PremiumReportOrganization
): string {
  const studentName =
    `${data.studentFirstName} ${data.studentLastName}`.trim() || "—";
  const fallbackInitial =
    organization.name.trim().charAt(0).toUpperCase() || "C";
  const logo = organization.logoUrl
    ? `<img class="logo" src="${esc(organization.logoUrl)}" alt="Logo" />`
    : `<span class="mono">${esc(fallbackInitial)}</span>`;
  const addressLine = formatOrganizationAddress(organization);
  const contacts = [
    organization.phone ? `Tél. : ${esc(organization.phone)}` : null,
    organization.email ? `Email : ${esc(organization.email)}` : null,
    organization.website ? `Site web : ${esc(organization.website)}` : null,
  ].filter((v): v is string => v !== null);

  const rowsHtml =
    data.rows.length === 0
      ? `<tr><td colspan="4" style="text-align:center;color:#9ca3af;padding:14px 8px;">Aucune note saisie pour cette période.</td></tr>`
      : data.rows
          .map(
            (row, index) => `<tr>
        <td>${esc(row.evaluationTitle)} — ${esc(row.module)}<br /><span style="color:#9ca3af;font-size:9.5px;">Seuil de validation : ${formatScore(row.passingScore)}</span></td>
        <td>${row.date ? esc(frDate.format(row.date)) : "—"}</td>
        <td class="n">${formatScoreOnScale(row.score, row.maxScore)}</td>
        <td class="c">${row.passed === true ? `<span class="dec">Validé</span>` : row.passed === false ? `<span class="dec bad">Non validé</span>` : `<span class="dec wait">Non noté</span>`}</td>
      </tr>`
          )
          .join("");

  const legal = [
    organization.rccm ? `N° RCCM : ${esc(organization.rccm)}` : null,
    organization.ifu ? `N° IFU / NIF : ${esc(organization.ifu)}` : null,
  ].filter((v): v is string => v !== null);

  const head = [
    "<!DOCTYPE html>",
    '<html lang="fr">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>Document ${esc(data.documentNumber)}</title>`,
    `<style>${STYLES}</style>`,
    "</head>",
    "<body>",
    '<main class="sheet">',
    `<div class="watermark" aria-hidden="true"><span>${data.scope === "global" ? "RAPPORT" : "BULLETIN"}</span></div>`,
    '<div class="inner">',
  ].join("\n");

  const documentLabel =
    data.scope === "global"
      ? "Rapport global administratif"
      : "Bulletin académique";

  const header = [
    '<header class="header">',
    `<div class="left">${logo}<p class="school">${esc(organization.name)}</p>${addressLine ? `<p class="base">${esc(addressLine)}</p>` : ""}</div>`,
    `<div class="right"><span class="title">${documentLabel}</span>${contacts.length > 0 ? `<p class="contact">${contacts.join("<br />")}</p>` : ""}<p class="num">N° ${esc(data.documentNumber)} · Édité le ${esc(frDate.format(data.issuedAt))}</p></div>`,
    "</header>",
  ].join("\n");

  const card = [
    '<section class="card"><div class="grid">',
    `<div class="f"><strong>Élève</strong>${esc(studentName)}</div>`,
    `<div class="f"><strong>Matricule</strong>${esc(data.studentCode)}</div>`,
    `<div class="f"><strong>Période / Semestre</strong>${esc(data.periodLabel)}</div>`,
    `<div class="f"><strong>Classe / Groupe</strong>${esc(data.className ?? "—")}</div>`,
    `<div class="f"><strong>Cours</strong>${esc(data.courseTitle ?? "—")}</div>`,
    `<div class="f"><strong>Professeur responsable</strong>${esc(data.teacherName ?? "—")}</div>`,
    "</div></section>",
  ].join("\n");

  const table = [
    '<h2 class="st">Évaluations modulaires</h2>',
    '<table class="g"><thead><tr><th>Évaluation / Module</th><th>Date</th><th class="n">Note (barème)</th><th class="c">Statut</th></tr></thead>',
    `<tbody>${rowsHtml}`,
    `<tr class="total"><td>Modules validés</td><td></td><td class="n">${data.gradedModules > 0 ? `${data.validatedModules} / ${data.gradedModules}` : "—"}</td><td class="c"><span class="${data.gradedModules > 0 && data.validatedModules === data.gradedModules ? "dec" : "dec wait"}">${data.gradedModules > 0 && data.validatedModules === data.gradedModules ? "Formation validée" : "En cours"}</span></td></tr>`,
    "</tbody></table>",
  ].join("\n");

  const formatFcfa = (value: number | null): string =>
    value === null
      ? "—"
      : `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} FCFA`;

  const historyHtml = (entries: PremiumPaymentEntry[]): string =>
    `<table class="hist"><thead><tr><th>Date</th><th>Mode de paiement</th><th class="n">Montant</th></tr></thead><tbody>${
      entries.length === 0
        ? `<tr><td colspan="3" style="text-align:center;color:#9ca3af;">Aucun versement enregistré.</td></tr>`
        : entries
            .map(
              (entry) =>
                `<tr><td>${esc(frDate.format(entry.paidAt))}</td><td>${esc(entry.method)}${entry.reference ? ` <span class="ref">(${esc(entry.reference)})</span>` : ""}</td><td class="n">${formatFcfa(entry.amount)}</td></tr>`
            )
            .join("")
    }</tbody></table>`;

  const attendanceHtml =
    data.attendance === null
      ? ""
      : [
          '<section class="att"><p>Résumé d\u2019assiduité</p><div class="row">',
          `<div class="cell"><b>${data.attendance.total}</b><small>Total</small></div>`,
          `<div class="cell"><b>${data.attendance.present}</b><small>Présences</small></div>`,
          `<div class="cell"><b>${data.attendance.late}</b><small>Retards</small></div>`,
          `<div class="cell"><b>${data.attendance.absent}</b><small>Absences</small></div>`,
          `<div class="cell"><b>${data.attendance.excused}</b><small>Excusées</small></div>`,
          "</div></section>",
        ].join("\n");

  // Récapitulatif financier + procédure de voyage : RAPPORT GLOBAL
  // (admin / staff) uniquement — le bulletin académique est sans données
  // financières ni de procedure de voyage.
  const financialHtml =
    data.financial === null
      ? ""
      : [
          '<section class="fin"><p>Récapitulatif financier</p><div class="grid">',
          `<div class="f"><strong>Prix formation</strong>${formatFcfa(data.financial.totalCost)}</div>`,
          `<div class="f"><strong>Réduction</strong>${esc(data.financial.discountLabel ?? "—")}</div>`,
          `<div class="f"><strong>Montant payé</strong>${formatFcfa(data.financial.amountPaid)}</div>`,
          `<div class="f"><strong>Reste à payer</strong>${data.financial.remaining !== null && data.financial.remaining === 0 ? "Soldé" : formatFcfa(data.financial.remaining)}</div>`,
          "</div><p>Historique des versements</p>",
          historyHtml(data.financial.history),
          "</section>",
        ].join("\n");

  const travelHtml =
    data.travel === null
      ? ""
      : [
          '<section class="travel"><p>Procédure de voyage</p>',
          `<div class="meta"><span>${esc(data.travel.destination)}${data.travel.targetProgram ? ` — ${esc(data.travel.targetProgram)}` : ""}</span><span>${esc(data.travel.statusLabel)}</span></div>`,
          data.travel.steps.length > 0
            ? `<ul class="steps">${data.travel.steps
                .map(
                  (step) =>
                    `<li class="step${step.validated ? " done" : ""}">${step.validated ? "✓ " : ""}${esc(step.label)}</li>`
                )
                .join("")}</ul>`
            : "",
          `<p class="progress">Avancement : <b>${data.travel.validatedSteps} / ${data.travel.totalSteps}</b> étapes validées</p>`,
          '<div class="grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px 14px;">',
          `<div class="f"><strong>Coût du dossier</strong>${formatFcfa(data.travel.totalCost)}</div>`,
          `<div class="f"><strong>Réduction</strong>${data.travel.discount !== null ? formatFcfa(data.travel.discount) : "—"}</div>`,
          `<div class="f"><strong>Montant payé</strong>${formatFcfa(data.travel.amountPaid)}</div>`,
          `<div class="f"><strong>Reste à payer</strong>${data.travel.remaining !== null && data.travel.remaining === 0 ? "Soldé" : formatFcfa(data.travel.remaining)}</div>`,
          "</div><p>Historique des règlements (procédure de voyage)</p>",
          historyHtml(data.travel.history),
          "</section>",
        ].join("\n");

  const tail = [
    `<div class="app"><p class="lab">Appréciation / Recommandations de l'enseignant</p><p>${esc(data.generalAppreciation)}</p></div>`,
    '<section class="sig">',
    '<div class="box"><span>Signature de l\u2019enseignant</span></div>',
    '<div class="box"><span>Signature de la direction + cachet</span></div>',
    "</section>",
    '<footer class="foot">',
    legal.length > 0 ? `<p class="leg">${legal.join(" · ")}</p>` : "",
    `<p>Document N° ${esc(data.documentNumber)} — généré le ${esc(frDate.format(data.issuedAt))} · vérifiable auprès de ${esc(organization.name)}${organization.phone ? ` · ${esc(organization.phone)}` : ""}.</p>`,
    "<p>Toute reproduction sans le cachet officiel est sans valeur. Document strictement confidentiel.</p>",
    "</footer>",
    "</div></main></body></html>",
  ].join("\n");

  return [
    head,
    header,
    card,
    table,
    attendanceHtml,
    financialHtml,
    travelHtml,
    tail,
  ].join("\n");
}
