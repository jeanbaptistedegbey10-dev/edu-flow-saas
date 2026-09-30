import { getMyClasses } from "@/actions/attendance";
import { FullSheetView } from "@/components/attendance/full-sheet-view";

export const metadata = {
  title: "Feuille récapitulative complète | EduFlow",
  description:
    "Récapitulatif complet d'une classe : toutes les séances, présences et cahier de texte réunis sur toute la durée de la classe.",
};

export default async function FullSheetPage() {
  const classes = await getMyClasses();

  return <FullSheetView classes={classes} />;
}
