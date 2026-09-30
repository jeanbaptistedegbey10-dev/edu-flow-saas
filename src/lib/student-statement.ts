/**
 * Génération du "Relevé Général de Compte Élève" (historique financier 360°) :
 * fusion des règlements de scolarité (`Payment`) et des achats en caisse
 * (`StudentTransaction`) sur une même feuille A4.
 *
 * Approche retenue : modèle HTML autonome et stylisé + impression via
 * `window.print()` dans un iframe caché (« Destination : Enregistrer au
 * format PDF » depuis la boîte d'impression du navigateur).
 */

import type { StudentDetailDTO } from "@/actions/students";
import type { StudentFinancialSummaryDTO } from "@/lib/student-finance";
import type { OrganizationProfileDTO } from "@/actions/payments";
import { buildOrganizationHeader, buildLegalFooter, escapeHtml } from "@/lib/receipt";

// Formatage déterministe (locale + fuseau fixes) pour un rendu stable.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const amountFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

function formatAmount(amount: number): string {
  return `${amountFormatter.format(Math.round(amount))} FCFA`;
}

function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

/** Libellés courts des types de transaction pour le tableau. */
const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  TUITION: "Scolarité",
  BOOK: "Livre",
  SERVICE: "Service",
  OTHER: "Autre",
};

/** Entrée unifiée du tableau chronologique. */
type LedgerEntry = {
  date: Date;
  type: string;
  description: string;
  amount: number;
  paymentMode: string;
};

/**
 * Construit le HTML complet du relevé général de compte élève.
 */
export function buildStudentStatementDocument(
  student: StudentDetailDTO,
  summary: StudentFinancialSummaryDTO,
  organization: OrganizationProfileDTO
): string {
  // Fusionne paiements scolarité + achats caisse dans un tableau
  // chronologique trié du plus récent au plus ancien.
  const entries: LedgerEntry[] = [
    ...(student.payments ?? []).map((p) => ({
      date: p.paidAt,
      type: "Scolarité",
      description:
        p.description ||
        p.reference ||
        `Règlement ${p.paymentMethod || ""}`.trim(),
      amount: p.amount,
      paymentMode: p.paymentMethod || "N/A",
    })),
    ...(student.studentTransactions ?? []).map((tx) => ({
      date: tx.createdAt,
      type: TRANSACTION_TYPE_LABELS[tx.type] ?? tx.type,
      description: tx.description,
      amount: tx.amount,
      paymentMode: tx.paymentMode,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalDepense = summary.totalTuitionPaid + summary.totalPosSpent;
  const hasFinancials = summary.netAmount !== null;

  // --- Lignes du tableau chronologique (mouvements) ---
  const rows =
    entries.length === 0
      ? '<tr><td colspan="5" class="empty">Aucune transaction enregistrée pour cet élève.</td></tr>'
      : entries
          .map((entry) => {
            const typeBadgeClass =
              entry.type === "Scolarité"
                ? "badge-tuition"
                : entry.type === "Livre"
                ? "badge-book"
                : entry.type === "Service"
                ? "badge-service"
                : "badge-other";
            return `<tr>
          <td class="nowrap">${escapeHtml(formatDate(entry.date))}</td>
          <td><span class="badge ${typeBadgeClass}">${escapeHtml(entry.type)}</span></td>
          <td>${escapeHtml(entry.description)}</td>
          <td class="num">${escapeHtml(formatAmount(entry.amount))}</td>
          <td>${escapeHtml(entry.paymentMode)}</td>
        </tr>`;
          })
          .join("\n");

  // --- Lignes du tableau de synthèse (détail des totaux) ---
  const detailRows = hasFinancials
    ? [
        `<tr><th>Coût initial de la formation</th><td class="strong mono">${escapeHtml(formatAmount(summary.totalCost ?? 0))}</td></tr>`,
        `<tr><th>Réduction</th><td class="strong mono">${summary.discount ? escapeHtml(formatAmount(summary.discount)) : "—"}</td></tr>`,
        `<tr><th>Net à payer</th><td class="strong mono">${summary.netAmount ? escapeHtml(formatAmount(summary.netAmount)) : "—"}</td></tr>`,
        `<tr><th>Scolarité encaissée</th><td class="strong mono">${escapeHtml(formatAmount(summary.totalTuitionPaid))}</td></tr>`,
        `<tr><th>Achats en caisse (livres / services)</th><td class="strong mono">${escapeHtml(formatAmount(summary.totalPosSpent))}</td></tr>`,
        `<tr><th>Total dépensé par le parent</th><td class="strong mono">${escapeHtml(formatAmount(totalDepense))}</td></tr>`,
        `<tr><th>Reste à payer (scolarité)</th><td class="strong mono ${summary.isFullyPaid ? "text-green" : "text-red"}">${summary.remainingAmount !== null ? escapeHtml(formatAmount(summary.remainingAmount)) : "—"}</td></tr>`,
      ].join("\n")
    : '<tr><th colspan="2">Aucun financement défini pour cet élève.</th></tr>';

  // --- Bloc parent / tuteur ---
  const parentInfo = student.parentName
    ? `<p>Tuteur : <span class="strong">${escapeHtml(student.parentName)}</span>${student.parentRelation ? ` (${escapeHtml(student.parentRelation)})` : ""}</p>`
    : "";
  const contact = escapeHtml(student.parentPhone1 ?? student.phone ?? "—");

  // --- Lignes de la synthèse finale ---
  const summaryBoxRows = hasFinancials
    ? [
        `<tr><td>Scolarité encaissée</td><td>${escapeHtml(formatAmount(summary.totalTuitionPaid))}</td></tr>`,
        `<tr><td>Achats en caisse</td><td>${escapeHtml(formatAmount(summary.totalPosSpent))}</td></tr>`,
        `<tr class="total"><td>Total dépensé par le parent</td><td>${escapeHtml(formatAmount(totalDepense))}</td></tr>`,
        !summary.isFullyPaid
          ? `<tr><td>Reste à payer (scolarité)</td><td class="text-red">${summary.remainingAmount !== null ? escapeHtml(formatAmount(summary.remainingAmount)) : "—"}</td></tr>`
                  : '<tr><td>Solde</td><td class="text-green">Soldé(e)</td></tr>',
      ].join("\n")
    : "";

  // --- Feuille de style A4 (portrait) ---
  const styles = `
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: "Segoe UI", system-ui, Arial, sans-serif; color: #111827; }
    body { background: #f3f4f6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { max-width: 794mm; margin: 24px auto; padding: 36px 40px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
    @page { size: A4; margin: 12mm; }
    @media print {
      @page { margin: 8mm; }
      html, body { width: 100%; }
      body { background: #fff; }
      .sheet { margin: 0; border: none; border-radius: 0; max-width: none; padding: 0; }
    }
    .doc-title { font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #111827; margin-bottom: 4px; }
    .doc-subtitle { font-size: 11px; color: #6b7280; margin-bottom: 20px; }
    .student-header { display: flex; gap: 24px; margin-bottom: 24px; flex-wrap: wrap; }
    .student-header .avatar { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #eef2ff, #e0e7ff); display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; color: #3730a3; flex-shrink: 0; }
    .student-info h2 { font-size: 20px; font-weight: 700; margin: 0 0 4px; color: #111827; }
    .student-info p { font-size: 12px; color: #6b7280; margin: 2px 0; }
    table.details { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    table.details th, table.details td { padding: 8px 0; font-size: 12.5px; text-align: left; border-bottom: 1px solid #f3f4f6; }
    table.details th { width: 180px; font-weight: 500; color: #6b7280; }
    table.details td.strong { font-weight: 600; color: #111827; }
    table.details td.mono { font-family: Consolas, "Courier New", monospace; font-size: 11px; }
    table.details td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #374151; margin-top: 26px; margin-bottom: 8px; }
    table.history { width: 100%; border-collapse: collapse; font-size: 12px; }
    table.history th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; background: #f9fafb; border-bottom: 1px solid #111827; padding: 7px 8px; }
    table.history td { padding: 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    table.history td.num { text-align: right; font-variant-numeric: tabular-nums; }
    table.history td.nowrap { white-space: nowrap; }
    table.history td.empty { text-align: center; color: #9ca3af; padding: 20px 8px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 600; }
    .badge-tuition { background: #dcfce7; color: #166534; }
    .badge-book { background: #dbeafe; color: #1d4ed8; }
    .badge-service { background: #f3e5f5; color: #7c3aed; }
    .badge-other { background: #f1f5f9; color: #475569; }
    .summary-box { margin-top: 24px; padding: 16px 20px; border: 1px solid #111827; border-radius: 8px; background: #fafaf9; }
    .summary-box table { border-collapse: collapse; }
    .summary-box td { padding: 6px 0; font-size: 12.5px; border-bottom: 1px solid #e5e7eb; }
    .summary-box td:first-child { width: 50%; }
    .summary-box td:last-child { text-align: right; font-weight: 600; }
    .summary-box tr.total td:last-child { font-size: 15px; font-weight: 700; color: #111827; }
    .text-red { color: #dc2626; }
    .text-green { color: #166534; }
    .footer { margin-top: 32px; font-size: 9px; color: #6b7280; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  `;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Relevé Général de Compte Élève</title>
  <style>${styles}</style>
</head>
<body>
  <div class="sheet">
    ${buildOrganizationHeader(organization, "Relevé Général de Compte Élève", student.studentCode)}

    <div class="doc-title">Relevé Général de Compte Élève</div>
    <div class="doc-subtitle">Historique complet des règlements et achats (scolarité + caisse)</div>

    <div class="student-header">
      <div class="avatar">${escapeHtml((student.firstName.charAt(0) + student.lastName.charAt(0)).toUpperCase())}</div>
      <div class="student-info">
        <h2>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</h2>
        <p>Matricule : <span class="strong">${escapeHtml(student.studentCode)}</span></p>
        <p>Classe actuelle : <span class="strong">${escapeHtml(student.currentClassName ?? "Non définie")}</span></p>
        ${parentInfo}
        <p>Contact : <span class="strong">${contact}</span></p>
      </div>
    </div>

    <table class="details">${detailRows}</table>

    <div class="section-title">Historique des mouvements</div>
    <table class="history">
      <thead>
        <tr>
          <th class="nowrap">Date</th>
          <th>Type</th>
          <th>Désignation</th>
          <th class="num">Montant</th>
          <th>Mode de paiement</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    ${hasFinancials ? `<div class="summary-box"><table>${summaryBoxRows}</table></div>` : ""}

    <div class="footer">
      ${buildLegalFooter(organization)}
    </div>
  </div>
</body>
</html>`;
}