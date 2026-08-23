import { getCourses, getTeachers } from "@/actions/courses";
import { CoursesView } from "@/components/courses/courses-view";

export const metadata = {
  title: "Cours | EduFlow",
  description: "Gestion du catalogue de cours du centre de formation.",
};

export default async function CoursesPage() {
  const [courses, teachers] = await Promise.all([getCourses(), getTeachers()]);

  return <CoursesView courses={courses} teachers={teachers} />;
}