import {
  getEcheancesDashboard,
  getScheduleClassOptions,
} from "@/lib/actions/schedules";
import { EcheancesView } from "@/components/payments/echeances-view";

export const metadata = {
  title: "Échéances | EduFlow",
  description:
    "Suivi des échéances de paiement : à venir, dues et en retard, avec relances en un clic.",
};

export default async function EcheancesPage() {
  // Lecture parallèle : tableau de bord (vide par défaut) + liste des classes
  // pour le filtre « par classe ».
  const [dashboard, classes] = await Promise.all([
    getEcheancesDashboard({}),
    getScheduleClassOptions(),
  ]);

  return <EcheancesView data={dashboard} classes={classes} />;
}
