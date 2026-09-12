import { notFound } from "next/navigation";

import { getClassDetail } from "@/actions/classes";
import { ClassDetailView } from "@/components/classes/class-detail-view";

export const metadata = {
  title: "Détail de la classe | EduFlow",
  description:
    "Fiche détaillée de la classe : étudiants inscrits, présences et cahier de texte.",
};

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // L'action lève une erreur si la classe est introuvable ou si
  // l'utilisateur n'a pas les droits (enseignant non assigné, étudiant…).
  let detail;
  try {
    detail = await getClassDetail(id);
  } catch {
    notFound();
  }

  return <ClassDetailView detail={detail} />;
}