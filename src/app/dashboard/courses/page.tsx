import { auth } from "@/auth";
import { getCourses } from "@/actions/courses";
import { CoursesView } from "@/components/courses/courses-view";

export const metadata = {
  title: "Cours | EduFlow",
  description: "Gestion du catalogue de cours du centre de formation.",
};

export default async function CoursesPage() {
  const session = await auth();
  const isTeacher = session?.user?.role === "TEACHER";

  // Un enseignant ne reçoit que les cours qui lui sont assignés
  // (filtrage effectué dans l'action getCourses).
  const courses = await getCourses();

  return (
    <CoursesView courses={courses} isTeacher={isTeacher} />
  );
}