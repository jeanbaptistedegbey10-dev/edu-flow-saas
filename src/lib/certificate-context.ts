/**
 * Contexte d'affichage des certificats (page /dashboard/certificates).
 *
 * Le modèle `Certificate` ne référence PAS directement la classe : un
 * certificat est émis pour un étudiant (et, le cas échéant, le cours porteur).
 * La classe d'origine est donc DÉDUITE de l'historique des inscriptions
 * (`ClassEnrollment`). Ce rattachement est indispensable pour que les
 * certificats des étudiants de classes clôturées / archivées (« Terminer la
 * classe ») restent liés à la bonne classe, même après promotion vers une
 * nouvelle cohorte.
 */

import type { ClassStatus } from "@prisma/client";

// --------------------------------------
// Types
// --------------------------------------

/** Ligne légère de l'historique d'inscriptions d'un étudiant. */
export type CertificateEnrollmentContext = {
  classId: string;
  className: string;
  classStatus: ClassStatus;
  /** Cours porteur de la classe — sert au rattachement par parcours. */
  courseId: string;
  enrolledAt: Date;
};

/** Classe courante d'un étudiant (`Student.currentClass`). */
export type StudentCurrentClassContext = {
  id: string;
  name: string;
  status: ClassStatus;
  courseId: string;
};

/** Classe d'origine résolue pour un certificat. */
export type CertificateClassContext = {
  classId: string;
  className: string;
  classStatus: ClassStatus;
};

// --------------------------------------
// Année académique
// --------------------------------------

/**
 * Année académique d'une date — convention septembre → août, calculée en UTC
 * pour rester déterministe entre serveur et client (aucun écart
 * d'hydratation, aucun décalage de fuseau).
 *
 * Exemples :
 * - 2026-09-05 → « 2026-2027 » (rentrée de septembre) ;
 * - 2026-08-31 → « 2025-2026 » (fin d'année académique précédente).
 */
export function getAcademicYear(date: Date): string {
  const year = date.getUTCFullYear();
  // Mois indexés 0-11 : 8 = septembre (début de l'année académique).
  return date.getUTCMonth() >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

// --------------------------------------
// Résolution de la classe d'origine
// --------------------------------------

/**
 * Résout la classe d'origine d'un certificat à partir de l'historique
 * d'inscriptions de l'étudiant :
 *
 * 1. Les candidats sont restreints au cours porteur du certificat
 *    (`courseId`) lorsque renseigné — un certificat de fin de niveau généré
 *    par la clôture appartient à la classe DU COURS clôturé, pas à la classe
 *    cible du passage (ex : A1 → A2) ;
 * 2. Parmi les candidats, la promotion la plus récente dont l'inscription
 *    précède la date d'émission est retenue (gère le redoublement : même
 *    cours, classe différente l'année suivante) ;
 * 3. À défaut, la promotion candidate la plus ancienne (certificat émis avant
 *    la première inscription connue) ;
 * 4. Repli : la classe courante de l'étudiant, uniquement si elle est
 *    cohérente avec le parcours du certificat (ou si le certificat est sans
 *    cours) ;
 * 5. `null` si aucun rattachement n'est possible (affichage « — »).
 */
export function resolveCertificateClassContext(input: {
  issueDate: Date;
  courseId: string | null;
  /** Historique d'inscriptions de l'étudiant, trié par `enrolledAt` croissant. */
  enrollments: CertificateEnrollmentContext[];
  currentClass: StudentCurrentClassContext | null;
}): CertificateClassContext | null {
  const { issueDate, courseId, enrollments, currentClass } = input;

  const candidates = courseId
    ? enrollments.filter((enrollment) => enrollment.courseId === courseId)
    : enrollments;

  if (candidates.length > 0) {
    // Dernière inscription antérieure ou égale à la date d'émission (les
    // candidats sont triés par `enrolledAt` croissant).
    let boundary = -1;
    for (let i = 0; i < candidates.length; i += 1) {
      if (candidates[i].enrolledAt.getTime() <= issueDate.getTime()) {
        boundary = i;
      } else {
        break;
      }
    }

    const selected = boundary >= 0 ? candidates[boundary] : candidates[0];

    return {
      classId: selected.classId,
      className: selected.className,
      classStatus: selected.classStatus,
    };
  }

  if (currentClass && (!courseId || currentClass.courseId === courseId)) {
    return {
      classId: currentClass.id,
      className: currentClass.name,
      classStatus: currentClass.status,
    };
  }

  return null;
}
