import { getStudents } from "@/actions/students";
import { StudentsView } from "@/components/students/students-view";

export const metadata = {
  title: "Étudiants | EduFlow",
  description: "Gestion des étudiants du centre de formation.",
};

export default async function StudentsPage() {
  const students = await getStudents();

  return <StudentsView students={students} />;
}