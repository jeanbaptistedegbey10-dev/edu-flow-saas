"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookOpenIcon,
  ClockIcon,
  LayersIcon,
  SearchIcon,
  UsersRoundIcon,
} from "lucide-react";

import type { CourseDTO } from "@/actions/courses";
import { deleteCourseAction } from "@/actions/courses";
import { AddCourseDialog } from "@/components/courses/add-course-dialog";
import { EditCourseDialog } from "@/components/courses/edit-course-dialog";
import { CourseScheduleButton } from "@/components/courses/course-schedule-button";
import { EntityActionsMenu } from "@/components/shared/entity-actions-menu";
import { Input } from "@/components/ui/input";

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
  isTeacher,
  onEdit,
  onDelete,
}: {
  course: CourseDTO;
  /** Un enseignant ne voit ni prix ni actions d'administration. */
  isTeacher?: boolean;
  onEdit: (course: CourseDTO) => void;
  onDelete: (course: CourseDTO) => Promise<{ ok: boolean; message?: string }>;
}) {
  const enrollmentCount = course._count.enrollments;

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:border-primary hover:shadow-md">
      <div className="flex flex-col gap-2 p-4">
        {/* Code + prix + actions */}
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-medium tracking-wide">
            {course.code}
          </span>

          <div className="flex items-center gap-1.5">
            {/* Donnée financière masquée aux enseignants */}
            {!isTeacher ? (
              <span className="text-sm font-semibold tabular-nums">
                {formatPrice(course.price)}
              </span>
            ) : null}
            {!isTeacher ? (
              <EntityActionsMenu
                entityName={`le cours « ${course.title} »`}
                onEdit={() => onEdit(course)}
                onDelete={() => onDelete(course)}
              />
            ) : null}
          </div>
        </div>

        {/* Intitulé (lien vers la fiche détaillée / cahier de texte) */}
        <Link
          href={`/dashboard/courses/${course.id}`}
          className="font-semibold leading-snug hover:underline"
        >
          {course.title}
        </Link>

        {/* Description (tronquée) */}
        {course.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {course.description}
          </p>
        ) : null}
      </div>

      {/* Métadonnées : durée, inscrits */}
      <div className="flex flex-col gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground">
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

      {/* Action principale : accéder aux classes concernées (cohortes)
          rattachées à ce cours — vue Classes pré-filtrée par courseId. */}
      <div className="flex flex-col gap-2 border-t border-border p-3">
        <Link
          href={`/dashboard/classes?courseId=${course.id}`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <LayersIcon className="size-4" />
          Accéder aux classes concernées
        </Link>
        {/* Personnalisation de l'échéancier de paiement (masquée aux enseignants). */}
        {!isTeacher ? (
          <CourseScheduleButton
            courseId={course.id}
            courseTitle={course.title}
            coursePrice={course.price}
          />
        ) : null}
      </div>
    </div>
  );
}

// --------------------------------------
// Vue principale
// --------------------------------------

export function CoursesView({
  courses,
  isTeacher = false,
}: {
  courses: CourseDTO[];
  /** Masque les données financières et les actions d'administration. */
  isTeacher?: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const [editingCourse, setEditingCourse] = React.useState<CourseDTO | null>(
    null
  );

  /** Recherche instantanée par intitulé ou code. */
  const filteredCourses = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return courses;

    return courses.filter((course) => {
      return (
        course.title.toLowerCase().includes(query) ||
        course.code.toLowerCase().includes(query)
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
          <h2 className="text-2xl font-semibold tracking-tight">Cours</h2>
          <p className="text-base text-muted-foreground">
            {isTeacher
              ? "Les cours qui vous sont assignés."
              : "Gérez le catalogue des formations proposées par votre centre."}
          </p>
        </div>
        {/* La création de cours est réservée à l'administration */}
        {!isTeacher ? <AddCourseDialog /> : null}
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
                  isTeacher={isTeacher}
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
        open={editingCourse !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCourse(null);
        }}
      />
    </div>
  );
}