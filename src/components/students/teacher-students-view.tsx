"use client";

import * as React from "react";
import {
  GraduationCapIcon,
  Loader2Icon,
  PrinterIcon,
  SearchIcon,
  TriangleAlertIcon,
} from "lucide-react";

import type { TeacherStudentDTO } from "@/actions/students";
import {
  getPremiumReportForStudent,
  type PremiumReportDTO,
} from "@/actions/evaluations";
import {
  getCurrentOrganizationProfile,
  type OrganizationProfileDTO,
} from "@/actions/payments";
import { ReportCardDialog } from "@/components/evaluations/report-card-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getStudentStatusBadgeClass,
  getStudentStatusLabel,
} from "@/lib/student-status";
import { cn } from "@/lib/utils";

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/**
 * Bouton « Bulletin » compact : ouvre l'aperçu du Bulletin Académique
 * (enseignant) — aucun élément financier ni procédure de voyage n'est inclus,
 * la Server Action le garantit côté serveur (`scope: "academic"`).
 */
function TeacherStudentReportButton({ studentId }: { studentId: string }) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<PremiumReportDTO | null>(null);
  const [organization, setOrganization] =
    React.useState<OrganizationProfileDTO | null>(null);

  const handleOpen = async () => {
    setErrorMessage(null);
    setLoading(true);
    try {
      const [dto, org] = await Promise.all([
        getPremiumReportForStudent(studentId),
        getCurrentOrganizationProfile(),
      ]);
      setReport({ ...dto, issuedAt: new Date(dto.issuedAt) });
      setOrganization(org);
      setOpen(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Impossible de générer le bulletin pour le moment."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void handleOpen()}
        disabled={loading}
        title="Aperçu du bulletin académique (sans données financières)"
      >
        {loading ? (
          <Loader2Icon data-icon="inline-start" className="animate-spin" />
        ) : (
          <PrinterIcon data-icon="inline-start" />
        )}
        {loading ? "Chargement..." : "Bulletin"}
      </Button>

      {errorMessage ? (
        <p
          role="alert"
          className="mt-1 flex items-center gap-1.5 text-xs text-destructive"
        >
          <TriangleAlertIcon data-icon="inline-start" />
          {errorMessage}
        </p>
      ) : null}

      {organization && report ? (
        <ReportCardDialog
          data={report}
          organization={organization}
          open={open}
          onOpenChange={setOpen}
        />
      ) : (
        <ReportCardDialog
          data={null}
          organization={{
            name: "Centre de Formation Excellence",
            address: null,
            city: null,
            phone: null,
            email: null,
            website: null,
            logoUrl: null,
            rccm: null,
            ifu: null,
          }}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

/** Rendu lisible du récapitulatif d'assiduité dans une cellule. */
function AttendanceSummary({
  attendance,
}: {
  attendance: TeacherStudentDTO["attendance"];
}) {
  const parts: Array<{ label: string; value: number }> = [
    { label: "Présences", value: attendance.present },
    { label: "Retards", value: attendance.late },
    { label: "Absences", value: attendance.absent },
    { label: "Excusés", value: attendance.excused },
  ];

  return attendance.total === 0 ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {parts.map((part) => (
        <span key={part.label} className="whitespace-nowrap">
          <span className="font-medium tabular-nums text-foreground">
            {part.value}
          </span>{" "}
          {part.label}
        </span>
      ))}
    </div>
  );
}
/**
 * « Mes Étudiants » — vue enseignant : liste UNIQUEMENT les étudiants inscrits
 * dans les classes / cours assignés à l'enseignant connecté. Aucune donnée
 * financière (coût, paiements) n'est affichée.
 */
export function TeacherStudentsView({
  students,
}: {
  students: TeacherStudentDTO[];
}) {
  const [search, setSearch] = React.useState("");

  const filteredStudents = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return students;

    return students.filter(
      (student) =>
        `${student.firstName} ${student.lastName}`
          .toLowerCase()
          .includes(query) ||
        student.studentCode.toLowerCase().includes(query) ||
        (student.className?.toLowerCase().includes(query) ?? false) ||
        (student.courseTitle?.toLowerCase().includes(query) ?? false)
    );
  }, [students, search]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-8">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <GraduationCapIcon className="size-6 text-muted-foreground" />
            Mes Étudiants
          </h2>
          <p className="text-base text-muted-foreground">
            Les apprenants inscrits dans vos classes — accès au bulletin
            académique uniquement.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-card text-card-foreground shadow-sm transition-all duration-200 dark:border-slate-800">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par nom, code, classe..."
              aria-label="Rechercher un étudiant"
              className="pl-8"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {filteredStudents.length} étudiant
            {filteredStudents.length > 1 ? "s" : ""}
          </p>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <p className="font-medium">
              {students.length === 0
                ? "Aucun étudiant inscrit dans vos classes"
                : "Aucun résultat"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {students.length === 0
                ? "Les étudiants sont rattachés à vos classes depuis le module « Classes »."
                : "Essayez une autre recherche."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Étudiant</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Formation</TableHead>
                  <TableHead>Assiduité</TableHead>
                  <TableHead className="text-right">Bulletin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <span className="font-medium whitespace-nowrap">
                        {student.firstName} {student.lastName}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {student.studentCode}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          BADGE_BASE_CLASSES,
                          getStudentStatusBadgeClass(student.status)
                        )}
                      >
                        {getStudentStatusLabel(student.status)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {student.className ? (
                        <span className="truncate">{student.className}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {student.courseTitle ?? "—"}
                    </TableCell>
                    <TableCell>
                      <AttendanceSummary attendance={student.attendance} />
                    </TableCell>
                    <TableCell className="text-right">
                      <TeacherStudentReportButton studentId={student.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}