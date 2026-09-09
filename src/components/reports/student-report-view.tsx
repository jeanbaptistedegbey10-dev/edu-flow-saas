import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@prisma/client";

const BADGE_CLASSES: Record<string, string> = {
  PRESENT: "bg-emerald-100 text-emerald-700",
  LATE: "bg-amber-100 text-amber-700",
  ABSENT: "bg-red-100 text-red-700",
  EXCUSED: "bg-sky-100 text-sky-700",
};

const STATUS_LABELS: Record<string, string> = {
  PRESENT: "Présent",
  LATE: "En retard",
  ABSENT: "Absent",
  EXCUSED: "Excusé",
};

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
    </svg>
  );
}

export default function StudentReportView({
  student,
  attendanceSummary,
  attendanceHistory,
  totalPaid,
  balance,
  travelStatus,
  organizationName,
  generatedAt,
}: {
  student: {
    studentCode: string; firstName: string; lastName: string;
    email: string | null; phone: string; status: string; netAmount: number | null;
    isSelfFinanced: boolean;
    parentName: string | null; parentRelation: string | null;
    parentPhone1: string | null; parentPhone2: string | null;
    currentClassName: string | null;
  };
  attendanceSummary: { total: number; present: number; late: number; absent: number; excused: number };
  attendanceHistory: { id: string; dateFormatted: string; status: AttendanceStatus; courseTitle: string; className: string | null }[];
  totalPaid: number; balance: number;
  travelStatus: string | null;
  organizationName: string;
  generatedAt: string;
}) {
  return (