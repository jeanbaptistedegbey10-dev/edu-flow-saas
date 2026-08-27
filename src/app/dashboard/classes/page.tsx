import { getClasses } from "@/actions/classes";
import { getCourses, getTeachers } from "@/actions/courses";
import { ClassesView } from "@/components/classes/classes-view";

export const metadata = {
  title: "Classes | EduFlow",
  description:
    "Gestion des classes / cohortes et de leurs créneaux horaires.",
};

export default async function ClassesPage() {
  const [classes, courses, teachers] = await Promise.all([
    getClasses(),
    getCourses(),
    getTeachers(),
  ]);

  return <ClassesView classes={classes} courses={courses} teachers={teachers} />;
}