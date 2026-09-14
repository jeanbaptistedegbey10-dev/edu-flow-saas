/**
 * Rapport de présence d'un étudiant pour une classe précise (historique
 * académique). Même approche que `lib/report-card.ts` / `lib/attendance-sheet.ts` :
 * un document HTML autonome et stylisé, imprimé via `printHtmlDocument`
 * (iframe cachée + `window.print()`).
 *
 * Le rapport est FIGÉ par classe : il reflète les émargements de la classe
 * concernée uniquement (jamais ceux de la classe active).
 */

import type { AttendanceStatus } from "@prisma/client";

import { getAttendanceStatusLabel } from "@/lib/attendance-status";

/** Émargement d'une séance pour l'étudiant concerné. */
export type StudentAttendanceSessionRow = {
  date: Date;
  status: AttendanceStatus;
  notes: string | null;
};

/** Données d'entrée du rapport de présence par classe. */
export type StudentAttendanceReportInput = {
  studentName: string;
  studentCode: string;
  className: string;
  courseTitle: string;
  courseCode: string;
  /** Créneau de la classe (ex : « 08h-11h »), facultatif. */
  schedule?: string | null;
  sessions: StudentAttendanceSessionRow[];
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
const STATUS_STYLES: Record<AttendanceStatus, { background: string; color: string }> = {
  PRESENT: { background: "#d1fae5", color: "#065f46" },
  LATE: { background: "#fef3c7", color: "#92400e" },
  ABSENT: { background: "#fee2e2", color: "#991b1b" },
  EXCUSED: { background: "#e0f2fe", color: "#075985" },
};

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
  .doc-header h1 { margin: 0; font-size: 20px; font-weight: 700; }
  .doc-header .subtitle { margin: 4px 0 0; color: #4b5563; font-size: 13px; }
  .meta { text-align: right; font-size: 12.5px; color: #374151; line-height: 1.6; }
  .meta strong { color: #111827; }
  .student-banner {
    display: flex;
    flex-wrap: wrap;
    gap: 16px 32px;
    margin: 18px 0;
    padding: 12px 16px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 13px;
  }
  .student-banner strong { font-size: 14px; }
  table.attendance { width: 100%; border-collapse: collapse; font-size: 13px; }
  table.attendance th, table.attendance td {
    border: 1px solid #e5e7eb;
    padding: 7px 10px;
    text-align: left;
    vertical-align: top;
  }
  table.attendance thead th { background: #f3f4f6; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; width: 46px; }
  .badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 11.5px;
    font-weight: 600;
  }
  .summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    margin-top: 14px;
    padding: 10px 14px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 12.5px;
  }
  .summary .num { font-weight: 700; }
  .signatures {
    display: flex;
    justify-content: space-between;
    gap: 32px;
    margin-top: 28px;
    font-size: 12.5px;
    color: #374151;
  }
  .sig { border-top: 1px solid #9ca3af; padding-top: 6px; min-width: 200px; }
  .empty { margin-top: 16px; padding: 14px; border: 1px dashed #d1d5db; border-radius: 8px; color: #6b7280; font-size: 13px; }
`;

/**
 * Construit le document HTML complet du rapport de présence d'un étudiant
 * pour une classe donnée (récapitulatif + détail des émargements).
 */
export function buildStudentAttendanceReportDocument(
  data: StudentAttendanceReportInput
): string {
  const sessions = [...data.sessions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const counts = {
    present: sessions.filter((s) => s.status === "PRESENT").length,
    late: sessions.filter((s) => s.status === "LATE").length,
    absent: sessions.filter((s) => s.status === "ABSENT").length,
    excused: sessions.filter((s) => s.status === "EXCUSED").length,
  };

  const bodyRows = sessions
    .map((session, index) => {
      const style = STATUS_STYLES[session.status];
      return [
        "<tr>",
        `<td class="num">${index + 1}</td>`,
        `<td>${escapeHtml(dateFormatter.format(new Date(session.date)))}</td>`,
        `<td><span class="badge" style="background:${style.background};color:${style.color};">${escapeHtml(getAttendanceStatusLabel(session.status))}</span></td>`,
        `<td>${session.notes ? escapeHtml(session.notes) : "&nbsp;"}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");

  const attendanceSection =
    sessions.length === 0
      ? `<div class="empty">Aucun émargement enregistré pour cet étudiant dans cette classe.</div>`
      : `<table class="attendance">
      <thead>
        <tr>
          <th class="num">N&deg;</th>
          <th style="width:160px;">Date de s&eacute;ance</th>
          <th style="width:120px;">Statut</th>
          <th>Remarques</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Rapport de présence — ${escapeHtml(data.className)}</title>
<style>${BASE_STYLES}</style>
</head>
<body>
  <div class="sheet">
    <div class="doc-header">
      <div>
        <h1>Rapport de présence</h1>
        <p class="subtitle">Assiduité par classe — ${escapeHtml(data.courseTitle)}</p>
      </div>
      <div class="meta">
        <div>Classe : <strong>${escapeHtml(data.className)}</strong></div>
        <div>Code : <strong>${escapeHtml(data.courseCode)}</strong></div>
        ${data.schedule ? `<div>Créneau : ${escapeHtml(data.schedule)}</div>` : ""}
        <div>Édité le : <strong>${escapeHtml(dateFormatter.format(new Date()))}</strong></div>
      </div>
    </div>

    <div class="student-banner">
      <div>Étudiant : <strong>${escapeHtml(data.studentName)}</strong></div>
      <div>Matricule : <strong>${escapeHtml(data.studentCode)}</strong></div>
    </div>

    ${attendanceSection}

    <div class="summary">
      <span>Séances : <span class="num">${sessions.length}</span></span>
      <span>Présences : <span class="num">${counts.present}</span></span>
      <span>Retards : <span class="num">${counts.late}</span></span>
      <span>Absences : <span class="num">${counts.absent}</span></span>
      <span>Excusés : <span class="num">${counts.excused}</span></span>
    </div>

    <div class="signatures">
      <div class="sig">L'enseignant(e)</div>
      <div class="sig">La direction / Responsable pédagogique</div>
    </div>
  </div>
</body>
</html>`;
}

