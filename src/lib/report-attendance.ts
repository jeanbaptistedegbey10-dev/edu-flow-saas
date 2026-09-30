/**
 * Métriques d'assiduité d'un bulletin + fragment HTML pour les documents
 * imprimables autonomes (bulletin d'examen, bulletin récapitulatif).
 *
 * Source unique de vérité partagée entre :
 * - le rendu React des feuilles A4 (`components/reports/*-sheet.tsx`) ;
 * - les documents HTML téléchargés (`lib/exam-report-document.ts`,
 *   `lib/premium-report-document.ts`) ;
 * - les Server Actions (`actions/evaluations.ts`) qui alimentent les bulletins.
 *
 * DÉFINITIONS RETENUES :
 * - « Séances présentes » = `PRESENT` + `LATE` : l'élève était bien sur la
 *   séance (un retard n'est pas une absence) ;
 * - « Taux de présence » = séances présentes / séances émargées, en % ;
 * - « Absences » = `ABSENT` (les `EXCUSED` sont comptées à part).
 */

/** Compteurs bruts d'émargements (provenant de la table `Attendance`). */
export type AttendanceCounters = {
  /** Nombre total d'émargements considérés. */
  total: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
};

/** Métriques d'assiduité affichées sur le bulletin. */
export type AttendanceMetrics = {
  /** Nombre total de séances émargées. */
  totalSessions: number;
  /** Séances où l'élève était présent (présent OU en retard). */
  presentSessions: number;
  /** Séances marquées « absent » (non justifiées). */
  absentSessions: number;
  /** Séances marquées « retard » (comptées comme présence). */
  lateSessions: number;
  /** Absences justifiées. */
  excusedSessions: number;
  /** Taux de présence en pourcentage (0–100), null si aucune séance. */
  attendanceRate: number | null;
};

/** Convertit des compteurs d'émargements en métriques de bulletin. */
export function computeAttendanceMetrics(
  counters: AttendanceCounters
): AttendanceMetrics {
  const totalSessions = Math.max(0, counters.total);
  const presentSessions = Math.max(0, counters.present) + Math.max(0, counters.late);

  return {
    totalSessions,
    presentSessions,
    absentSessions: Math.max(0, counters.absent),
    lateSessions: Math.max(0, counters.late),
    excusedSessions: Math.max(0, counters.excused),
    attendanceRate:
      totalSessions === 0
        ? null
        : Math.round((presentSessions / totalSessions) * 100),
  };
}

/** Taux de présence formaté (« 92 % », « — » si non calculable). */
export function formatAttendanceRate(rate: number | null): string {
  return rate === null ? "—" : `${rate} %`;
}

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

const ATTENDANCE_TONES: Record<
  "rate" | "sessions" | "absent" | "excused",
  { background: string; color: string }
> = {
  rate: { background: "#eef2ff", color: "#3730a3" },
  sessions: { background: "#d1fae5", color: "#065f46" },
  absent: { background: "#fee2e2", color: "#991b1b" },
  excused: { background: "#e0f2fe", color: "#075985" },
};

/**
 * Fragment HTML autonome de la section « Assiduité / Présences » pour les
 * documents imprimables téléchargés (même contenu que le rendu React).
 * Retourne une chaîne vide si aucune donnée de présence n'est disponible.
 */
export function buildAttendanceSectionHtml(
  metrics: AttendanceMetrics | null
): string {
  if (metrics === null || metrics.totalSessions === 0) return "";

  const cards: Array<[string, string, keyof typeof ATTENDANCE_TONES]> = [
    ["Séances présentes", `${metrics.presentSessions} / ${metrics.totalSessions}`, "sessions"],
    ["Taux de présence", formatAttendanceRate(metrics.attendanceRate), "rate"],
    ["Absences", String(metrics.absentSessions), "absent"],
    ["Absences excusées", String(metrics.excusedSessions), "excused"],
  ];

  const cells = cards
    .map(([label, value, toneKey]) => {
      const tone = ATTENDANCE_TONES[toneKey];
      return `<div class="kpi" style="background:${tone.background};color:${tone.color};"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
    })
    .join("");

  return [
    '<section class="att">',
    '<h2 class="st">Assiduité / Présences</h2>',
    `<div class="kpis">${cells}</div>`,
    `<p class="note">Suivi des émargements de l'élève sur la période (${esc(String(metrics.presentSessions))} séance(s) présence(s) sur ${esc(String(metrics.totalSessions))}, taux ${esc(formatAttendanceRate(metrics.attendanceRate))}).</p>`,
    "</section>",
  ].join("\n");
}