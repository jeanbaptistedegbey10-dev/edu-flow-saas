import { getMyClasses } from "@/actions/attendance";
import { AttendanceSheetView } from "@/components/attendance/attendance-sheet-view";

export const metadata = {
  title: "Feuille d'appel | EduFlow",
  description:
    "Saisie rapide des présences pour une session de cours — interface mobile-friendly.",
};

export default async function AttendanceSheetPage() {
  const classes = await getMyClasses();

  return <AttendanceSheetView classes={classes} />;
}
