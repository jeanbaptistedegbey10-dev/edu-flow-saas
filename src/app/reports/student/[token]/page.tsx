import { notFound } from "next/navigation";

import { getPublicStudentReport } from "@/actions/evaluations";
import { PublicStudentReport } from "@/components/reports/public-student-report";

export const metadata = {
  title: "Rapport parent | EduFlow",
  description:
    "Bulletin d'évaluation et rapport d'assiduité — accès sécurisé par lien parent.",
};

/**
 * Page publique du lien parent : consulte et imprime le bulletin premium
 * d'un étudiant SANS compte. Le token (clé d'accès) ne permet aucune
 * modification — lecture seule.
 */
export default async function StudentReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Lecture du bulletin en try/catch (la donnée, JAMAIS le JSX : les erreurs
  // de rendu relèvent d'un error boundary, pas de ce catch).
  let payload: Awaited<ReturnType<typeof getPublicStudentReport>> | null = null;
  try {
    payload = await getPublicStudentReport(token);
  } catch {
    notFound();
  }

  // Garde : `notFound()` a déjà levé si le catch s'est déclenché.
  if (!payload) notFound();

  const { report, organization } = payload;

  return (
    <PublicStudentReport
      data={report}
      organization={organization}
    />
  );
}