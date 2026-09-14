import { notFound } from "next/navigation";

import { getCloseClassData } from "@/actions/class-closure";
import { ClassClosureView } from "@/components/classes/class-closure-view";

export const metadata = {
  title: "Clôture de la classe | EduFlow",
  description:
    "Clôturez la session : récapitulatif des modules validés / non validés et décisions de passage.",
};

export default async function ClassClosePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // L'action lève une erreur si la classe est introuvable ou si l'utilisateur
  // n'a pas les droits (étudiant, enseignant…).
  let data;
  try {
    data = await getCloseClassData(id);
  } catch {
    notFound();
  }

  return <ClassClosureView data={data} />;
}
