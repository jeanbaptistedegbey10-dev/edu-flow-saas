import type { ArchiveSearchResultDTO, ArchivedClassDTO } from "@/actions/archives";
import { ArchiveClassCard } from "@/components/archives/archive-class-card";
import { formatArchiveAmount } from "@/components/archives/archive-format";

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

export function YearOverview({
  years,
  year,
  classes,
  totals,
  loadingYear,
  onOpen,
}: {
  years: string[];
  year: string | null;
  classes: ArchivedClassDTO[];
  totals: { studentCount: number; totalDue: number; totalPaid: number; remaining: number };
  loadingYear: boolean;
  onOpen: (enrollmentId: string) => void;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Classes cloturees" value={String(classes.length)} />
        <StatCard label="Etudiants inscrits (epoque)" value={totals.studentCount.toLocaleString("fr-FR")} />
        <StatCard label="Montant total englobe" value={formatArchiveAmount(totals.totalDue)} />
        <StatCard
          label="Montant regle / Solde restant"
          value={`${formatArchiveAmount(totals.totalPaid)} / ${formatArchiveAmount(totals.remaining)}`}
        />
      </div>
      {years.length === 0 ? (
        <EmptyState message="Aucune annee archivee : aucune classe cloturee ou archivee." />
      ) : loadingYear ? (
        <EmptyState message="Chargement des archives…" />
      ) : classes.length === 0 ? (
        <EmptyState message={`Aucune classe cloturee pour l'annee ${year}.`} />
      ) : (
        <div className="grid gap-4">
          {classes.map((klass) => (
            <ArchiveClassCard key={`${klass.classId}-${klass.academicYear}`} klass={klass} onOpen={onOpen} />
          ))}
        </div>
      )}
    </>
  );
}

export function SearchResults({
  results,
  onOpen,
}: {
  results: ArchiveSearchResultDTO;
  onOpen: (enrollmentId: string) => void;
}) {
  if (results.students.length === 0 && results.classes.length === 0) {
    return <EmptyState message="Aucun resultat dans les archives pour cette recherche." />;
  }
  return (
    <div className="grid gap-4">
      {results.students.map((s) => (
        <div key={s.studentId} className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="font-semibold">
            {s.firstName} {s.lastName}{" "}
            <span className="text-sm font-normal text-muted-foreground">({s.studentCode})</span>
          </p>
          <div className="mt-2 grid gap-2">
            {s.enrollments.map((e) => (
              <button
                key={e.enrollmentId}
                type="button"
                onClick={() => onOpen(e.enrollmentId)}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
              >
                <span>
                  {e.className} — {e.courseTitle} · {e.academicYear}
                </span>
                <span className="text-xs text-muted-foreground">
                  Regle {formatArchiveAmount(e.paidAmount)} / Reste {formatArchiveAmount(e.remainingAmount)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {results.classes.map((klass) => (
        <ArchiveClassCard key={`${klass.classId}-${klass.academicYear}`} klass={klass} onOpen={onOpen} />
      ))}
    </div>
  );
}
