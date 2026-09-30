import { auth } from "@/auth";
import { getClasses } from "@/actions/classes";
import { getCourses, getTeachers } from "@/actions/courses";
import { ClassesView } from "@/components/classes/classes-view";
import { canManageClassLifecycle } from "@/lib/role";

export const metadata = {
  title: "Classes | EduFlow",
  description:
    "Gestion des classes / cohortes et de leurs créneaux horaires.",
};

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string }>;
}) {
  const [classes, courses, teachers, session, params] = await Promise.all([
    getClasses(),
    getCourses(),
    getTeachers(),
    auth(),
    searchParams,
  ]);

  // « Démarrer la classe » / « Terminer la classe » : actes de gestion
  // réservés aux rôles administratifs (les enseignants consultent et
  // émargent sans muter le cycle de vie de la classe).
  const canManageLifecycle = canManageClassLifecycle(session?.user?.role);

  // Filtre optionnel « par cours » (depuis les cartes de cours :
  // /dashboard/classes?courseId=...). Seul un cours connu de l'organisation
  // est accepté : un identifiant arbitraire est ignoré afin d'éviter une
  // vue vide et trompeuse.
  const filteredCourse = params.courseId
    ? (courses.find((course) => course.id === params.courseId) ?? null)
    : null;

  return (
    <ClassesView
      classes={classes}
      courses={courses}
      teachers={teachers}
      canManageLifecycle={canManageLifecycle}
      filteredCourse={filteredCourse}
    />
  );
}