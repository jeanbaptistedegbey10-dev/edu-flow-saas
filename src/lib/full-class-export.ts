/**
 * Export global d'une classe (toutes seances confondues).
 * Construit les lignes CSV et les documents HTML imprimables :
 * a) feuille de presence, b) cahier de texte, c) rapport combine.
 */

import type { AttendanceStatus } from "@prisma/client";

import type { FullClassExportDTO } from "@/actions/attendance";
import { getAttendanceStatusLabel } from "@/lib/attendance-status";

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

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const longFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function fmtDate(d: Date): string {
  return dateFmt.format(new Date(d));
}

const STATUS_STYLE: Record<AttendanceStatus, { bg: string; fg: string }> = {
  PRESENT: { bg: "#d1fae5", fg: "#065f46" },
  LATE: { bg: "#fef3c7", fg: "#92400e" },
  ABSENT: { bg: "#fee2e2", fg: "#991b1b" },
  EXCUSED: { bg: "#e0f2fe", fg: "#075985" },
};

const CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Segoe UI", system-ui, Arial, sans-serif; color: #111827; background: #f3f4f6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { max-width: 900px; margin: 24px auto; padding: 36px 40px; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; }
  @page { size: A4; margin: 12mm; }
  @media print { body { background: #fff; } .sheet { margin: 0; border: none; border-radius: 0; max-width: none; padding: 0; } }
  .doc-header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111827; padding-bottom: 14px; }
  .doc-header h1 { margin: 0; font-size: 20px; }
  .subtitle { margin: 4px 0 0; color: #4b5563; font-size: 13px; }
  .meta { font-size: 12px; color: #374151; text-align: right; }
  h2 { font-size: 15px; margin: 26px 0 8px; }
  table.grid { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  table.grid th { background: #f3f4f6; text-align: left; padding: 6px 8px; border: 1px solid #e5e7eb; }
  table.grid td { padding: 6px 8px; border: 1px solid #e5e7eb; vertical-align: top; }
  .badge { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 11px; font-weight: 600; }
  .summary { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; font-size: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; }
  .session-block { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; margin-top: 12px; page-break-inside: avoid; }
  .session-block h3 { margin: 0 0 4px; font-size: 13px; }
  .muted { color: #6b7280; font-size: 12px; }
  .signatures { display: flex; justify-content: space-between; gap: 24px; margin-top: 28px; }
  .sig { flex: 1; border-top: 1px solid #9ca3af; padding-top: 6px; font-size: 12px; color: #4b5563; }
`;
/** Ligne CSV : feuille de presence globale. */
export type FullAttendanceCsvRow = {
  date: string;
  session: string;
  chapter: string;
  studentCode: string;
  lastName: string;
  firstName: string;
  status: string;
  arrivalTime: string;
  notes: string;
};

export function buildFullAttendanceCsv(data: FullClassExportDTO): FullAttendanceCsvRow[] {
  const rows: FullAttendanceCsvRow[] = [];
  for (const session of data.sessions) {
    const date = fmtDate(session.sessionDate);
    for (const a of session.attendances) {
      rows.push({
        date,
        session: session.subjectName,
        chapter: session.chapter,
        studentCode: a.studentCode,
        lastName: a.lastName,
        firstName: a.firstName,
        status: getAttendanceStatusLabel(a.status),
        arrivalTime: a.arrivalTime ?? "",
        notes: a.notes ?? "",
      });
    }
  }
  return rows;
}

/** Ligne CSV : cahier de texte global. */
export type FullLogbookCsvRow = {
  date: string;
  title: string;
  chapter: string;
  summary: string;
  hours: string;
  teacher: string;
  present: number;
  total: number;
  status: string;
};

export function buildFullLogbookCsv(data: FullClassExportDTO): FullLogbookCsvRow[] {
  return data.sessions.map((session) => {
    const present = session.attendances.filter(
      (a) => a.status === "PRESENT" || a.status === "LATE"
    ).length;
    const hours =
      session.startTime && session.endTime
        ? `${session.startTime} - ${session.endTime}`
        : session.startTime ?? session.endTime ?? "";
    return {
      date: fmtDate(session.sessionDate),
      title: session.subjectName,
      chapter: session.chapter,
      summary: session.summary ?? "",
      hours,
      teacher: session.teacherName,
      present,
      total: session.attendances.length,
      status: session.status === "VALIDATED" ? "Validee" : "En attente",
    };
  });
}
function headerHtml(title: string, subtitle: string, data: FullClassExportDTO): string {
  const totalSessions = data.sessions.length;
  const totalMarks = data.sessions.reduce((n, s) => n + s.attendances.length, 0);
  return [
    `<div class="doc-header">`,
    `<div><h1>${esc(title)}</h1><p class="subtitle">${esc(subtitle)}</p></div>`,
    `<div class="meta">`,
    `<div>Classe : <strong>${esc(data.className)}</strong></div>`,
    `<div>Cours : <strong>${esc(data.courseTitle)} (${esc(data.courseCode)})</strong></div>`,
    `<div>Seances : <strong>${totalSessions}</strong> — Emargements : <strong>${totalMarks}</strong></div>`,
    `<div>Edite le : <strong>${esc(longFmt.format(new Date()))}</strong></div>`,
    `</div></div>`,
  ].join("");
}

/** a) Feuille de presence globale : tableau seance x apprenant. */
export function buildFullAttendanceDocument(data: FullClassExportDTO): string {
  const sections = data.sessions
    .map((session, idx) => {
      const present = session.attendances.filter(
        (a) => a.status === "PRESENT" || a.status === "LATE"
      ).length;
      const rows = session.attendances
        .map((a, i) => {
          const st = STATUS_STYLE[a.status];
          return `<tr><td>${i + 1}</td><td>${esc(a.studentCode)}</td><td><strong>${esc(a.firstName)} ${esc(a.lastName)}</strong></td><td><span class="badge" style="background:${st.bg};color:${st.fg};">${esc(getAttendanceStatusLabel(a.status))}</span></td><td>${a.arrivalTime ? esc(a.arrivalTime) : "&nbsp;"}</td><td>${a.notes ? esc(a.notes) : "&nbsp;"}</td></tr>`;
        })
        .join("");
      return `<div class="session-block"><h3>Seance ${idx + 1} — ${esc(fmtDate(session.sessionDate))} · ${esc(session.subjectName)}</h3><p class="muted">${esc(session.chapter)} — ${present}/${session.attendances.length} present(s)</p><table class="grid"><thead><tr><th>N°</th><th>Code</th><th>Nom</th><th>Statut</th><th>Heure</th><th>Motif</th></tr></thead><tbody>${rows || `<tr><td colspan="6" class="muted">Aucun emargement.</td></tr>`}</tbody></table></div>`;
    })
    .join("");
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" /><title>Feuille de presence — ${esc(data.className)}</title><style>${CSS}</style></head><body><div class="sheet">${headerHtml("Feuille de presence — historique complet", `${data.courseTitle} (${data.courseCode})`, data)}${sections || `<p class="muted">Aucune seance enregistree.</p>`}<div class="signatures"><div class="sig">L'enseignant(e)</div><div class="sig">La direction</div></div></div></body></html>`;
}

/** b) Cahier seul ou c) rapport combine (presences + cahier reunis). */
export function buildFullCombinedDocument(data: FullClassExportDTO, mode: "combined" | "logbook" = "combined"): string {
  const title = mode === "logbook" ? "Cahier de texte complet" : "Rapport combine — Presences + Cahier de texte";
  const blocks = data.sessions
    .map((session, idx) => {
      const present = session.attendances.filter(
        (a) => a.status === "PRESENT" || a.status === "LATE"
      ).length;
      const hours = session.startTime && session.endTime ? `${esc(session.startTime)} - ${esc(session.endTime)}` : "";
      const attendanceTable =
        mode === "combined"
          ? `<table class="grid"><thead><tr><th>N°</th><th>Apprenant</th><th>Statut</th><th>Motif</th></tr></thead><tbody>${session.attendances.map((a, i) => {
              const st = STATUS_STYLE[a.status];
              return `<tr><td>${i + 1}</td><td>${esc(a.firstName)} ${esc(a.lastName)} (${esc(a.studentCode)})</td><td><span class="badge" style="background:${st.bg};color:${st.fg};">${esc(getAttendanceStatusLabel(a.status))}</span></td><td>${a.notes ? esc(a.notes) : "&nbsp;"}</td></tr>`;
            }).join("") || `<tr><td colspan="4" class="muted">Aucun emargement.</td></tr>`}</tbody></table>`
          : `<div class="summary"><span>Presents : <strong>${present}/${session.attendances.length}</strong></span></div>`;
      return `<div class="session-block"><h3>Seance ${idx + 1} — ${esc(fmtDate(session.sessionDate))} · ${esc(session.subjectName)}</h3><p class="muted">${hours ? `${hours} · ` : ""}${esc(session.teacherName)} — ${present}/${session.attendances.length} present(s)</p><p><strong>Chapitre :</strong> ${esc(session.chapter)}</p><p><strong>Resume / Contenu :</strong> ${session.summary ? esc(session.summary) : "<span class='muted'>Non renseigne</span>"}</p>${attendanceTable}</div>`;
    })
    .join("");
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8" /><title>${esc(title)} — ${esc(data.className)}</title><style>${CSS}</style></head><body><div class="sheet">${headerHtml(title, `${data.courseTitle} (${data.courseCode})`, data)}${blocks || `<p class="muted">Aucune seance enregistree.</p>`}<div class="signatures"><div class="sig">L'enseignant(e)</div><div class="sig">La direction</div></div></div></body></html>`;
}
