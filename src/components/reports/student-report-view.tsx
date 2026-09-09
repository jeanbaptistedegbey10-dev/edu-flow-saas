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
  grades,
  travelStatus,
  organizationName,
  generatedAt,
  parentLink,
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
  grades: { module: string; score: number | null; maxScore: number }[];
  travelStatus: string | null;
  organizationName: string;
  generatedAt: string;
  parentLink?: string | null;
}) {
  const studentName = `${student.firstName} ${student.lastName}`;
  const fmt = new Intl.NumberFormat("fr-FR");
  const copyParentLink = async () => {
    if (!parentLink) return;
    try {
      await navigator.clipboard.writeText(parentLink);
    } catch {
      /* presse-papiers indisponible : lien selectionnable ci-dessous */
    }
  };
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 p-6">
      <header className="rounded-xl border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {organizationName}
        </p>
        <h1 className="mt-1 text-2xl font-bold">
          Rapport etudiant — {studentName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Code {student.studentCode} · Genere le {generatedAt}
        </p>
        {parentLink ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={parentLink}
              aria-label="Lien parent (lecture seule)"
              className="h-9 min-w-0 flex-1 rounded-md border bg-muted/40 px-3 text-xs"
              onFocus={(event) => event.target.select()}
            />
            <Button type="button" variant="outline" size="sm" onClick={copyParentLink}>
              <CopyIcon className="size-3.5" />
              Copier le lien parent
            </Button>
          </div>
        ) : null}
      </header>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Informations personnelles
        </h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Nom complet</dt>
            <dd className="font-medium">{studentName}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Telephone</dt>
            <dd className="font-medium">{student.phone}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium">{student.email ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Classe</dt>
            <dd className="font-medium">{student.currentClassName ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Assiduite
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge className={cn(BADGE_CLASSES.PRESENT)}>Present : {attendanceSummary.present}</Badge>
          <Badge className={cn(BADGE_CLASSES.LATE)}>En retard : {attendanceSummary.late}</Badge>
          <Badge className={cn(BADGE_CLASSES.ABSENT)}>Absent : {attendanceSummary.absent}</Badge>
          <Badge className={cn(BADGE_CLASSES.EXCUSED)}>Excuse : {attendanceSummary.excused}</Badge>
          <Badge variant="outline">Total : {attendanceSummary.total}</Badge>
        </div>
        <ul className="mt-4 grid gap-2">
          {attendanceHistory.slice(0, 10).map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <span className="text-muted-foreground">{entry.dateFormatted}</span>
              <span className="font-medium">{entry.courseTitle}</span>
              <Badge className={cn(BADGE_CLASSES[entry.status] ?? "")}>
                {STATUS_LABELS[entry.status] ?? entry.status}
              </Badge>
            </li>
          ))}
          {attendanceHistory.length === 0 ? (
            <li className="text-sm text-muted-foreground">Aucun emargement enregistre.</li>
          ) : null}
        </ul>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Scolarite et paiements
        </h2>
        <dl className="mt-3 grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Net a payer</dt>
            <dd className="font-semibold tabular-nums">
              {student.netAmount != null ? `${fmt.format(student.netAmount)} FCFA` : "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Paye</dt>
            <dd className="font-semibold tabular-nums text-emerald-600">
              {`${fmt.format(totalPaid)} FCFA`}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">Reste a payer</dt>
            <dd className={cn("font-semibold tabular-nums", balance > 0 ? "text-red-600" : "text-emerald-600")}>
              {balance > 0 ? `${fmt.format(balance)} FCFA` : "Solde"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Notes et remarques
        </h2>
        {grades.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Aucune note enregistree.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {grades.map((grade, index) => (
              <li
                key={`${grade.module}-${index}`}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <span className="font-medium">{grade.module}</span>
                <span className="tabular-nums text-muted-foreground">
                  {grade.score != null ? `${grade.score} / ${grade.maxScore}` : `— / ${grade.maxScore}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Mobilite et Visa
        </h2>
        <p className="mt-3 text-sm">
          {travelStatus ? (
            <Badge variant="outline">{travelStatus}</Badge>
          ) : (
            <span className="text-muted-foreground">Aucune procedure en cours.</span>
          )}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Document en lecture seule — ce lien parent ne permet aucune modification.
        </p>
      </section>
    </div>
  );
}