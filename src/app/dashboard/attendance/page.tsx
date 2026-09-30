import {
  getAttendanceOverviewStats,
  getMyClasses,
} from "@/actions/attendance";
import { AttendanceOverview } from "@/components/attendance/attendance-overview";
import { auth } from "@/auth";
import { canManageClassLifecycle } from "@/lib/role";

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

  // « Terminer la classe » : acte de gestion réservé aux rôles administratifs
  // (le bouton n'est rendu que pour eux).
  const session = await auth();

  return (
    <AttendanceOverview
      classes={classes}
      stats={stats}
      canManageLifecycle={canManageClassLifecycle(session?.user?.role)}
    />
  );
}

