"use client";

import * as React from "react";
import {
  BookOpenIcon,
  ClockIcon,
  GraduationCapIcon,
  SearchIcon,
  UsersRoundIcon,
} from "lucide-react";

import type { CourseDTO, TeacherDTO } from "@/actions/courses";
import { deleteCourseAction } from "@/actions/courses";
import { AddCourseDialog } from "@/components/courses/add-course-dialog";
import { EditCourseDialog } from "@/components/courses/edit-course-dialog";
import { EntityActionsMenu } from "@/components/shared/entity-actions-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Formatage déterministe (locale fixe) pour éviter tout écart d'hydratation.
const amountFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

function formatPrice(value: number): string {
  return `${amountFormatter.format(value)} FCFA`;
}

// --------------------------------------
// Sous-composants internes
// --------------------------------------

function CourseCard({
  course,
  onEdit,
  onDelete,
}: {
  course: CourseDTO;
  onEdit: (course: CourseDTO) => void;
  onDelete: (course: CourseDTO) => Promise<{ ok: boolean; message?: string }>;
}) {
  const enrollmentCount = course._count.enrollments;

  return (
    <div className="flex flex-col rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:from-card dark:to-card">
      <div className="flex flex-col gap-2 p-4">
        {/* Code + prix + actions */}
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-medium tracking-wide">
            {course.code}
          </span>

          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold tabular-nums">
              {formatPrice(course.price)}
            </span>
            <EntityActionsMenu
              entityName={`le cours « ${course.title} »`}
              onEdit={() => onEdit(course)}
              onDelete={() => onDelete(course)}
            />
          </div>
        </div>

        {/* Intitulé */}
        <h3 className="font-semibold leading-snug">{course.title}</h3>

        {/* Description (tronquée) */}
        {course.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {course.description}
          </p>
        ) : null}
      </div>

      {/* Métadonnées : enseignant, durée, inscrits */}
      <div className="mt-auto flex flex-col gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <GraduationCapIcon className="size-4 shrink-0" />
          <span className={cn(!course.teacher && "italic")}>
            {course.teacher
              ? `${course.teacher.firstName} ${course.teacher.lastName}`
              : "Enseignant non attribué"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <ClockIcon className="size-4 shrink-0" />
          <span>
            {course.durationWeeks} semaine{course.durationWeeks > 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <UsersRoundIcon className="size-4 shrink-0" />
          <span>
            {enrollmentCount} étudiant{enrollmentCount > 1 ? "s" : ""} inscrit
            {enrollmentCount > 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

// --------------------------------------
// Vue principale
// --------------------------------------

export function CoursesView({
  courses,
  teachers,
}: {
  courses: CourseDTO[];
  teachers: TeacherDTO[];
}) {
  const [search, setSearch] = React.useState("");
  const [editingCourse, setEditingCourse] = React.useState<CourseDTO | null>(
    null
  );

  /** Recherche instantanée par intitulé, code ou nom de l'enseignant. */
  const filteredCourses = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return courses;

    return courses.filter((course) => {
      return (
        course.title.toLowerCase().includes(query) ||
        course.code.toLowerCase().includes(query) ||
        `${course.teacher?.firstName ?? ""} ${course.teacher?.lastName ?? ""}`
          .toLowerCase()
          .includes(query)
      );
    });
  }, [courses, search]);

  /** Suppression d'un cours via le menu d'actions de la carte. */
  const handleDeleteCourse = (course: CourseDTO) =>
    deleteCourseAction(course.id);

  const hasCourses = courses.length > 0;
  const hasResults = filteredCourses.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Cours</h2>
          <p className="text-sm text-muted-foreground">
            Gérez le catalogue des formations proposées par votre centre.
          </p>
        </div>
        <AddCourseDialog teachers={teachers} />
      </div>

      {/* Recherche instantanée */}
      <div className="relative w-full sm:max-w-xs">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher par intitulé, code..."
          aria-label="Rechercher un cours"
          className="pl-8"
        />
      </div>

      {hasCourses ? (
        hasResults ? (
          <>
            {/* Grille de cartes de cours */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  onEdit={setEditingCourse}
                  onDelete={handleDeleteCourse}
                />
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              {filteredCourses.length} cours sur {courses.length}
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-6 py-12 text-center">
            <SearchIcon className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Aucun résultat trouvé</p>
            <p className="text-sm text-muted-foreground">
              Essayez un autre terme de recherche.
            </p>
          </div>
        )
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <BookOpenIcon className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium">Aucun cours pour le moment</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Commencez par ajouter votre premier cours au catalogue avec le
            bouton « Nouveau cours ».
          </p>
        </div>
      )}

      {/* Modale d'édition pré-remplie */}
      <EditCourseDialog
        course={editingCourse}
        teachers={teachers}
        open={editingCourse !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCourse(null);
        }}
      />
    </div>
  );
}