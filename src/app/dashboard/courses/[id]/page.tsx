import { notFound } from "next/navigation";

import { getCourseDetail } from "@/actions/attendance";
import { CourseDetailView } from "@/components/courses/course-detail-view";

export const metadata = {
  title: "Détail du cours | EduFlow",
  description:
    "Fiche détaillée du cours : étudiants inscrits et cahier de texte.",
};

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // L'action lève une erreur si le cours est introuvable ou si
  // l'utilisateur n'a pas les droits (enseignant non assigné, étudiant…).
  let detail;
  try {
    detail = await getCourseDetail(id);
  } catch {
    notFound();
  }

  return <CourseDetailView detail={detail} />;
}