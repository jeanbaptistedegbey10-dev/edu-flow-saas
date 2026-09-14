import {
  getAttendanceOverviewStats,
  getMyClasses,
} from "@/actions/attendance";
import { AttendanceOverview } from "@/components/attendance/attendance-overview";

export const metadata = {
  title: "Présences & Cahier de texte | EduFlow",
  description:
    "Prise de présence par classe / cohorte et par date, accès au cahier de texte.",
};

export default async function AttendancePage() {
  const [classes, stats] = await Promise.all([
    getMyClasses(),
    getAttendanceOverviewStats(),
  ]);

  return <AttendanceOverview classes={classes} stats={stats} />;
}

