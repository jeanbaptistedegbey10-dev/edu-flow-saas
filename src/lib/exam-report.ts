/**
 * Données du BULLETIN D'EXAMEN restreint à une session d'évaluation précise.
 *
 * Contrairement au bulletin récapitulatif premium (`lib/premium-report.ts`),
 * qui empile TOUTES les évaluations de l'année, ce document est limité à UNE
 * seule session d'examen : ses modules, leurs barèmes, les notes obtenues et
 * l'appréciation qui en découle. Il est généré depuis la grille de saisie des
 * notes du module Évaluations — le récapitulatif complet de l'année reste
 * accessible uniquement depuis la fiche détaillée de l'étudiant
 * (/dashboard/students/[id]).
 *
 * Formation modulaire : chaque module est validé INDÉPENDAMIMENT selon le
 * barème (maxScore) et le seuil (passingScore) configurés par le professeur.
 * Aucune moyenne générale, aucun coefficient : la note est affichée sur le
 * barème réel (ex : « 60 / 100 »).
 */

import type { AttendanceMetrics } from "@/lib/report-attendance";

/** Ligne module du bulletin d'examen : note obtenue sur le barème du module. */
export type ExamReportRow = {
  /** Nom du module évalué (ex : « Lesen »). */
  module: string;
  /** Note obtenue sur le barème du module (null si non noté). */
  score: number | null;
  /** Barème configuré par le professeur (ex : 100). */
  maxScore: number;
  /** Seuil de validation du module (ex : 60). */
  passingScore: number;
  /**
   * true : note >= seuil → module VALIDÉ.
   * false : note < seuil → module NON VALIDÉ.
   * null : module non noté (ligne sans statut).
   */
  passed: boolean | null;
};

/** Données complètes d'un bulletin d'examen, prêtes pour l'impression. */
export type ExamReportData = {
  studentFirstName: string;
  studentLastName: string;
  studentCode: string;
  /** Intitulé de l'examen (ex : « Examen Continu N°1 »). */
  evaluationTitle: string;
  /** Date de la session d'examen (UTC). */
  evaluationDate: Date;
  /** Classe / cohorte évaluée. */
  className: string;
  /** Cours (formation) rattaché à la classe évaluée. */
  courseTitle: string;
  courseCode: string;
  /** Enseignant responsable de la classe (null si non renseigné). */
  teacherName: string | null;
  /** Période / semestre saisi dans la grille de notes (null si vide). */
  periodLabel: string | null;
  /**
   * Modules de CETTE évaluation uniquement — jamais l'historique complet des
   * autres examens.
   */
  rows: ExamReportRow[];
  /** Nombre de modules notés pour cet examen. */
  gradedModules: number;
  /** Nombre de modules validés (note ≥ seuil) pour cet examen. */
  validatedModules: number;
  /**
   * Appréciation affichée sur le bulletin : texte PERSONNALISÉ par
   * l'enseignant s'il en a enregistré un, sinon texte automatique généré à
   * partir des modules validés (« 3 modules validés sur 4… »).
   */
  appreciation: string;
  /**
   * Suivi des présences (assiduité) de l'élève sur la classe évaluée :
   * séances présentes / total, taux de présence en % et nombre d'absences.
   * `null` si aucune séance n'a été émargée.
   */
  attendance: AttendanceMetrics | null;
  documentNumber: string;
  issuedAt: Date;
};

/**
 * Numéro de document unique du bulletin d'examen : `BEX-<ANNEE>-<XXXX>`
 * (préfixe distinct du `REP-` utilisé par le bulletin récapitulatif).
 */
export function formatExamReportNumber(issuedAt: Date): string {
  const y = issuedAt.getUTCFullYear();
  const random = Math.floor(Math.random() * 9000 + 1000);
  return `BEX-${y}-${random}`;
}
