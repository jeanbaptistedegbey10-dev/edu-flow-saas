import { connection } from "next/server";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getTeacherStudents } from "@/actions/students";
import { TeacherStudentsView } from "@/components/students/teacher-students-view";

export const metadata = {
  title: "Mes Étudiants | EduFlow",
  description:
    "Consultez les étudiants inscrits dans vos classes et ouvrez leur bulletin académique.",
};

export default async function TeacherStudentsPage() {
  // Rendu dynamique SSR garanti : `connection()` interrompt le pré-rendu
  // statique (doc locale Next.js 16). La page dépend de la session.
  await connection();

  const session = await auth();

  // Vue STRICTEMENT réservée aux enseignants : contrôle d'accès côté page en
  // plus du proxy (`/dashboard/students` étant interdit aux TEACHER).
  if (session?.user?.role !== "TEACHER") {
    redirect("/dashboard");
  }

  const students = await getTeacherStudents();

  return <TeacherStudentsView students={students} />;
}