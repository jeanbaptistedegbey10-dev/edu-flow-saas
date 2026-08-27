import { getMyClasses } from "@/actions/attendance";
import { EvaluationsView } from "@/components/evaluations/evaluations-view";

export const metadata = {
  title: "Évaluations & Examens | EduFlow",
  description:
    "Sessions d'examens internes par classe et saisie des notes par étudiant et par module.",
};

export default async function EvaluationsPage() {
  // Réutilise la liste des classes accessibles (enseignant : ses classes
  // assignées ; staff : toutes les classes de l'organisation).
  const classes = await getMyClasses();

  return <EvaluationsView classes={classes} />;
}