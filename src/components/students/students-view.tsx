"use client";

import * as React from "react";
import Link from "next/link";
import {
  DownloadIcon,
  LinkIcon,
  Loader2Icon,
  SearchIcon,
  UsersRoundIcon,
} from "lucide-react";

import type { ClassOptionDTO } from "@/actions/classes";
import type { StudentDTO } from "@/actions/students";
import {
  deleteStudentAction,
  ensureStudentReportToken,
} from "@/actions/students";
import { AddStudentDialog } from "@/components/students/add-student-dialog";
import { ImportStudentsDialog } from "@/components/students/import-students-dialog";
import { EditStudentDialog } from "@/components/students/edit-student-dialog";
import { ToastNotification } from "@/components/ui/toast";
import {
  EntityActionsMenu,
} from "@/components/shared/entity-actions-menu";
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
  STUDENT_STATUS_FILTERS,
  getStudentStatusBadgeClass,
  getStudentStatusLabel,
  type StudentStatusFilter,
} from "@/lib/student-status";
import { exportToCsv, type CsvColumn } from "@/lib/export";
import { cn } from "@/lib/utils";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart d'hydratation.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

// Formatage « court » (jj/mm/aaaa) dédié aux fichiers CSV exportés.
const csvDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/** Colonnes du fichier CSV d'export des étudiants. */
const STUDENT_CSV_COLUMNS: readonly CsvColumn<StudentDTO>[] = [
  { header: "Code étudiant", value: (student) => student.studentCode },
  { header: "Prénom", value: (student) => student.firstName },
  { header: "Nom", value: (student) => student.lastName },
  { header: "Email", value: (student) => student.email ?? "" },
  { header: "Téléphone", value: (student) => student.phone },
  {
    header: "Classe",
    value: (student) => student.currentClassName ?? "",
  },
  {
    header: "Frais d'inscription réglés",
    value: (student) => (student.hasPaidRegistrationFee ? "Oui" : "Non"),
  },
  {
    header: "Statut",
    value: (student) => getStudentStatusLabel(student.status),
  },
  {
    header: "Ajouté le",
    value: (student) => csvDateFormatter.format(student.createdAt),
  },
];

export function StudentsView({
  students,
  classes,
  registrationFee,
}: {
  students: StudentDTO[];
  /** Classes / cohortes disponibles pour l'affectation. */
  classes: ClassOptionDTO[];
  /** Frais d'inscription par défaut de l'organisation (FCFA). */
  registrationFee: number;
}) {
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] =
    React.useState<StudentStatusFilter>("ALL");
  const [editingStudent, setEditingStudent] = React.useState<StudentDTO | null>(
    null
  );

  // État du presse-papiers / lien parent.
  const [toast, setToast] = React.useState<string | null>(null);
  const [parentLinkPendingId, setParentLinkPendingId] = React.useState<
    string | null
  >(null);

  /**
   * Génère (ou réutilise) le token public de l'étudiant, copie l'URL
   * `/reports/student/<token>` dans le presse-papiers puis affiche un toast.
   */
  const handleCopyParentLink = async (studentId: string) => {
    setParentLinkPendingId(studentId);
    setToast(null);
    try {
      const result = await ensureStudentReportToken(studentId);
      if (!result.ok) {
        setToast(
          result.message ?? "Impossible de générer le lien parent pour le moment."
        );
        return;
      }
      const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/reports/student/${result.token}`;
      try {
        await navigator.clipboard.writeText(url);
        setToast("Lien parent copié dans le presse-papier !");
      } catch {
        setToast(
          "Lien généré, mais copie impossible : sélectionnez-le manuellement dans la fiche étudiant."
        );
      }
    } catch {
      setToast("Impossible de générer le lien parent pour le moment.");
    } finally {
      setParentLinkPendingId(null);
    }
  };

  const filteredStudents = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    return students.filter((student) => {
      if (statusFilter !== "ALL" && student.status !== statusFilter) {
        return false;
      }

      if (!query) return true;

      return (
        student.firstName.toLowerCase().includes(query) ||
        student.lastName.toLowerCase().includes(query) ||
        student.studentCode.toLowerCase().includes(query) ||
        student.phone.toLowerCase().includes(query) ||
        (student.email?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [students, search, statusFilter]);

  /**
   * Exporte les étudiants actuellement filtrés à l'écran (recherche +
   * filtre de statut actifs) vers un fichier CSV compatible Excel.
   */
  const handleExportCsv = () => {
    const today = csvDateFormatter.format(new Date()).replace(/\//g, "-");

    exportToCsv(`etudiants-${today}`, filteredStudents, STUDENT_CSV_COLUMNS);
  };

  const hasStudents = students.length > 0;
  const hasResults = filteredStudents.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Étudiants</h2>
          <p className="text-base text-muted-foreground">
            Gérez les étudiants de votre centre de formation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportStudentsDialog />
          <AddStudentDialog classes={classes} registrationFee={registrationFee} />
        </div>
      </div>

      {/* Carte : barre d'outils + tableau */}
      <div className="rounded-xl border border-slate-200/80 bg-card text-card-foreground shadow-sm transition-all duration-200 dark:border-slate-800">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Recherche instantanée */}
          <div className="relative w-full lg:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par nom, code, email..."
              aria-label="Rechercher un étudiant"
              className="pl-8"
            />
          </div>

          {/* Filtres par statut + export CSV */}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div
              role="group"
              aria-label="Filtrer par statut"
              className="flex flex-wrap items-center gap-1"
            >
              {STUDENT_STATUS_FILTERS.map((filter) => {
                const isActive = statusFilter === filter.value;

                return (
                  <Button
                    key={filter.value}
                    type="button"
                    variant="pill"
                    size="sm"
                    aria-pressed={isActive}
                    onClick={() => setStatusFilter(filter.value)}
                  >
                    {filter.label}
                  </Button>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={!hasResults}
            >
              <DownloadIcon data-icon="inline-start" />
              Exporter (CSV)
            </Button>
          </div>
        </div>

        {hasStudents ? (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Étudiant</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Téléphone</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Ajouté le</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <Link
                          href={`/dashboard/students/${student.id}`}
                          className="font-medium hover:underline"
                        >
                          {student.firstName} {student.lastName}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {student.studentCode}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {student.email ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {student.phone}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {student.currentClassName ?? (
                        <span className="italic opacity-60">Non affecté</span>
                      )}
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
                    <TableCell className="text-muted-foreground">
                      {dateFormatter.format(student.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div
                        role="group"
                        aria-label={`Actions pour ${student.firstName} ${student.lastName}`}
                        className="flex items-center justify-end gap-1.5"
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            void handleCopyParentLink(student.id)
                          }
                          disabled={parentLinkPendingId === student.id}
                          title="Copier le lien parent"
                        >
                          {parentLinkPendingId === student.id ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                          ) : (
                            <LinkIcon className="size-3.5" />
                          )}
                          <span className="sr-only">Copier le lien parent</span>
                        </Button>
                        <EntityActionsMenu
                          entityName={`${student.firstName} ${student.lastName}`}
                          onEdit={() => setEditingStudent(student)}
                          onDelete={() => deleteStudentAction(student.id)}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {!hasResults ? (
              <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
                <SearchIcon className="size-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">Aucun résultat trouvé</p>
                <p className="text-sm text-muted-foreground">
                  Essayez un autre terme de recherche ou changez de filtre de
                  statut.
                </p>
              </div>
            ) : (
              <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                {filteredStudents.length} étudiant
                {filteredStudents.length > 1 ? "s" : ""} sur {students.length}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <UsersRoundIcon className="size-6 text-muted-foreground" />
            </div>
            <p className="font-medium">Aucun étudiant pour le moment</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Commencez par ajouter votre premier étudiant avec le bouton
              « Nouvel étudiant ».
            </p>
          </div>
        )}
      </div>

      {/* Modale d'édition pré-remplie */}
      <EditStudentDialog
        student={editingStudent}
        classes={classes}
        registrationFee={registrationFee}
        open={editingStudent !== null}
        onOpenChange={(open) => {
          if (!open) setEditingStudent(null);
        }}
      />

      {/* Toast de confirmation de copie du lien parent */}
      <ToastNotification
        message={toast}
        onClose={() => setToast(null)}
      />
    </div>
  );
}