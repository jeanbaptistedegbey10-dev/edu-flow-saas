import { getMyClasses } from "@/actions/attendance";
import { AttendanceView } from "@/components/attendance/attendance-view";

export const metadata = {
  title: "Présences & Cahier de texte | EduFlow",
  description:
    "Prise de présence par classe / cohorte et par date, accès au cahier de texte.",
};

export default async function AttendancePage() {
  const classes = await getMyClasses();

  return <AttendanceView classes={classes} />;
}