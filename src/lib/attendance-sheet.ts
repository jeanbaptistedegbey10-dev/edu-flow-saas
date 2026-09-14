/**
 * Génération de la feuille de présence imprimable (rapport d'assiduité).
 *
 * Même approche que `lib/receipt.ts` / `lib/report-card.ts` : un document HTML
 * autonome et stylisé, imprimé via `printHtmlDocument` (iframe cachée +
 * `window.print()`). Permet l'impression physique ou l'enregistrement PDF natif
 * depuis la boîte de dialogue du navigateur.
 */

import type { AttendanceStatus } from "@prisma/client";

import { getAttendanceStatusLabel } from "@/lib/attendance-status";

/** Ligne d'étudiant de la feuille. */
export type AttendanceSheetRow = {
  studentId: string;
  studentCode: string;
  fullName: string;
  /** `null` => statut non encore renseigné (case vide à remplir sur papier). */
  status: AttendanceStatus | null;
  notes: string;
  /**
   * Heure d'arrivée (retards). La colonne « Heure » n'est affichée que si au
   * moins une ligne en contient.
   */
  arrivalTime?: string;
};

// Caractères spéciaux construits dynamiquement (entités HTML échappées).
const AMPERSAND = String.fromCharCode(38);
const LESS_THAN = String.fromCharCode(60);
const GREATER_THAN = String.fromCharCode(62);
const DOUBLE_QUOTE = String.fromCharCode(34);
const SINGLE_QUOTE = String.fromCharCode(39);

/** Échappe les caractères sensibles du HTML dans les valeurs dynamiques. */
function escapeHtml(value: string): string {
  return value
    .replace(new RegExp(AMPERSAND, "g"), `${AMPERSAND}amp;`)
    .replace(new RegExp(LESS_THAN, "g"), `${AMPERSAND}lt;`)
    .replace(new RegExp(GREATER_THAN, "g"), `${AMPERSAND}gt;`)
    .replace(new RegExp(DOUBLE_QUOTE, "g"), `${AMPERSAND}quot;`)
    .replace(new RegExp(SINGLE_QUOTE, "g"), `${AMPERSAND}#39;`);
}

// Formatage déterministe (locale + fuseau fixes) pour un rendu stable.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Couleurs des pastilles de statut (rendu écran = rendu impression). */
const STATUS_STYLES: Record<
  AttendanceStatus,
  { background: string; color: string }
> = {
  PRESENT: { background: "#d1fae5", color: "#065f46" },
  LATE: { background: "#fef3c7", color: "#92400e" },
  ABSENT: { background: "#fee2e2", color: "#991b1b" },
  EXCUSED: { background: "#e0f2fe", color: "#075985" },
};

// Feuille de style du document : A4 portrait, en-tête, tableau, récapitulatif
// et signatures — mêmes choix graphiques que les reçus (lib/receipt.ts).
const BASE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
    color: #111827;
    background: #f3f4f6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    max-width: 820px;
    margin: 24px auto;
    padding: 36px 40px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
  }
  @page { size: A4; margin: 12mm; }
  @media print {
    @page { margin: 8mm; }
    html, body { width: 100%; }
    body { background: #ffffff; }
    .sheet { margin: 0 auto; border: none; border-radius: 0; max-width: none; padding: 0; }
  }

  .doc-header {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: flex-start;
    border-bottom: 2px solid #111827;
    padding-bottom: 14px;
  }
  .doc-header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
  .doc-header .subtitle { margin: 4px 0 0; font-size: 12px; color: #6b7280; }
  .meta { font-size: 12.5px; line-height: 1.7; text-align: right; color: #374151; }
  .meta strong { color: #111827; }

  .legend { margin: 14px 0 0; font-size: 11px; display: flex; gap: 12px; flex-wrap: wrap; color: #6b7280; }
  .legend .swatch { display: inline-block; width: 9px; height: 9px; border-radius: 999px; margin-right: 4px; vertical-align: -1px; }

  table.attendance { width: 100%; margin-top: 12px; border-collapse: collapse; font-size: 12.5px; }
  table.attendance th {
    text-align: left;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6b7280;
    background: #f9fafb;
    border-bottom: 1px solid #d1d5db;
    padding: 8px;
  }
  table.attendance td { padding: 8px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
  table.attendance td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.attendance td.mono { font-family: Consolas, "Courier New", monospace; letter-spacing: 0.02em; white-space: nowrap; }
  table.attendance td .badge {
    display: inline-block;
    min-width: 62px;
    text-align: center;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
  }
  table.attendance td .blank {
    display: inline-block;
    min-width: 62px;
    text-align: center;
    border: 1px dashed #d1d5db;
    border-radius: 999px;
    padding: 3px 8px;
    font-size: 11px;
    color: #9ca3af;
  }
  .remarks { color: #6b7280; font-size: 11.5px; }

  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 24px;
    margin-top: 18px;
    padding: 12px 14px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 12.5px;
    font-weight: 600;
  }
  .summary .num { font-variant-numeric: tabular-nums; }

  .signatures {
    display: flex;
    justify-content: space-between;
    gap: 40px;
    margin-top: 56px;
    font-size: 12px;
    color: #374151;
  }
  .signatures .sig { flex: 1; border-top: 1px solid #9ca3af; padding-top: 6px; }
`;

/** Formate une date ISO « YYYY-MM-DD » en français (ex : « 14 septembre 2026 »). */
function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return dateFormatter.format(new Date(Date.UTC(y, m - 1, d)));
}
/**
 * Construit le document HTML autonome de la feuille de présence pour une
 * classe et une date données. Les statuts `null` sont rendus comme des cases
 * vides : le document sert aussi bien de rapport que de feuille vierge.
 */
export function buildAttendanceSheetDocument(options: {
  className: string;
  courseTitle: string;
  courseCode: string;
  scheduleText: string;
  date: string;
  rows: AttendanceSheetRow[];
}): string {
  const { className, courseTitle, courseCode, scheduleText, date, rows } =
    options;

  const hasArrivalTime = rows.some(
    (row) => (row.arrivalTime ?? "").trim().length > 0
  );

  const bodyRows = rows
    .map((row, index) => {
      const statusCell = row.status
        ? `<span class="badge" style="background:${STATUS_STYLES[row.status].background};color:${STATUS_STYLES[row.status].color};">${escapeHtml(getAttendanceStatusLabel(row.status))}</span>`
        : `<span class="blank">&nbsp;</span>`;
      const arrivalCell = hasArrivalTime
        ? `<td class="num">${row.arrivalTime ? escapeHtml(row.arrivalTime) : "&nbsp;"}</td>`
        : "";
      return [
        "<tr>",
        `<td class="num">${index + 1}</td>`,
        `<td class="mono">${escapeHtml(row.studentCode)}</td>`,
        `<td><strong>${escapeHtml(row.fullName)}</strong></td>`,
        `<td>${statusCell}</td>`,
        arrivalCell,
        `<td class="remarks">${row.notes ? escapeHtml(row.notes) : "&nbsp;"}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");

  const counts = {
    present: rows.filter((r) => r.status === "PRESENT").length,
    late: rows.filter((r) => r.status === "LATE").length,
    absent: rows.filter((r) => r.status === "ABSENT").length,
    excused: rows.filter((r) => r.status === "EXCUSED").length,
  };
  const unmarked =
    rows.length -
    (counts.present + counts.late + counts.absent + counts.excused);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Feuille de présence — ${escapeHtml(className)}</title>
<style>${BASE_STYLES}</style>
</head>
<body>
  <div class="sheet">
    <div class="doc-header">
      <div>
        <h1>Feuille de présence</h1>
        <p class="subtitle">Rapport d'assiduité — ${escapeHtml(courseTitle)}</p>
      </div>
      <div class="meta">
        <div>Classe : <strong>${escapeHtml(className)}</strong></div>
        <div>Code : <strong>${escapeHtml(courseCode)}</strong></div>
        <div>Date : <strong>${escapeHtml(formatDateFr(date))}</strong></div>
        ${scheduleText ? `<div>Créneau : ${escapeHtml(scheduleText)}</div>` : ""}
      </div>
    </div>

    <p class="legend">
      <span><span class="swatch" style="background:${STATUS_STYLES.PRESENT.color};"></span>Présent</span>
      <span><span class="swatch" style="background:${STATUS_STYLES.LATE.color};"></span>En retard</span>
      <span><span class="swatch" style="background:${STATUS_STYLES.ABSENT.color};"></span>Absent</span>
      <span><span class="swatch" style="background:${STATUS_STYLES.EXCUSED.color};"></span>Excusé</span>
    </p>

    <table class="attendance">
      <thead>
        <tr>
          <th style="width:36px;">N&deg;</th>
          <th style="width:92px;">Code</th>
          <th>Nom &amp; Pr&eacute;nom</th>
          <th style="width:112px;">Statut</th>
          ${hasArrivalTime ? '<th style="width:70px;">Heure</th>' : ""}
          <th>Remarques</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>

    <div class="summary">
      <span>Pr&eacute;sents : <span class="num">${counts.present}</span></span>
      <span>Retards : <span class="num">${counts.late}</span></span>
      <span>Absents : <span class="num">${counts.absent}</span></span>
      <span>Excus&eacute;s : <span class="num">${counts.excused}</span></span>
      <span>Non renseign&eacute;s : <span class="num">${unmarked}</span></span>
      <span>Effectif : <span class="num">${rows.length}</span></span>
    </div>

    <div class="signatures">
      <div class="sig">L&apos;enseignant(e)</div>
      <div class="sig">La direction / Responsable p&eacute;dagogique</div>
    </div>
  </div>
</body>
</html>`;
}