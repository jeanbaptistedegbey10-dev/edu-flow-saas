"use client";

import * as React from "react";
import {
  CalendarClockIcon,
  ClockIcon,
  GraduationCapIcon,
  LayersIcon,
  SearchIcon,
  UsersRoundIcon,
} from "lucide-react";

import type { CourseDTO, TeacherDTO } from "@/actions/courses";
import { deleteClassAction, type ClassDTO } from "@/actions/classes";
import { AddClassDialog } from "@/components/classes/add-class-dialog";
import { EditClassDialog } from "@/components/classes/edit-class-dialog";
import { EntityActionsMenu } from "@/components/shared/entity-actions-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

// --------------------------------------
// Sous-composants internes
// --------------------------------------

function ClassCard({
  klass,
  onEdit,
  onDelete,
}: {
  klass: ClassDTO;
  onEdit: (klass: ClassDTO) => void;
  onDelete: (klass: ClassDTO) => Promise<{ ok: boolean; message?: string }>;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:from-card dark:to-card">
      <div className="flex flex-col gap-2 p-4">
        {/* Nom + actions */}
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-medium tracking-wide">
            {klass.courseCode}
          </span>

          <EntityActionsMenu
            entityName={`la classe « ${klass.name} »`}
            onEdit={() => onEdit(klass)}
            onDelete={() => onDelete(klass)}
          />
        </div>

        <p className="font-semibold leading-snug">{klass.name}</p>

        <p className="text-sm text-muted-foreground">{klass.courseTitle}</p>
      </div>

      {/* Métadonnées : créneau, enseignant, effectif */}
      <div className="mt-auto flex flex-col gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <ClockIcon className="size-4 shrink-0" />
          <span>{klass.schedule}</span>
        </div>

        <div className="flex items-center gap-2">
          <GraduationCapIcon className="size-4 shrink-0" />
          <span className={cn(!klass.teacherName && "italic")}>
            {klass.teacherName ?? "Enseignant non attribué"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <UsersRoundIcon className="size-4 shrink-0" />
          <span>
            {klass.studentCount} étudiant{klass.studentCount > 1 ? "s" : ""}{" "}
            affecté{klass.studentCount > 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <CalendarClockIcon className="size-3.5 shrink-0" />
          Créée le {dateFormatter.format(klass.createdAt)}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------
// Vue principale
// --------------------------------------

export function ClassesView({
  classes,
  courses,
  teachers,
}: {
  classes: ClassDTO[];
  courses: CourseDTO[];
  teachers: TeacherDTO[];
}) {
  const [search, setSearch] = React.useState("");
  const [editingClass, setEditingClass] = React.useState<ClassDTO | null>(
    null
  );

  /** Recherche instantanée par nom de classe, cours ou enseignant. */
  const filteredClasses = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return classes;

    return classes.filter((klass) => {
      return (
        klass.name.toLowerCase().includes(query) ||
        klass.courseTitle.toLowerCase().includes(query) ||
        klass.courseCode.toLowerCase().includes(query) ||
        (klass.teacherName ?? "").toLowerCase().includes(query)
      );
    });
  }, [classes, search]);

  /** Suppression d'une classe via le menu d'actions de la carte. */
  const handleDeleteClass = (klass: ClassDTO) => deleteClassAction(klass.id);

  const hasClasses = classes.length > 0;
  const hasResults = filteredClasses.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Classes</h2>
          <p className="text-base text-muted-foreground">
            Gérez les cohortes et leurs créneaux horaires (ex : « A1 - Matin »,
            « 08h-11h »).
          </p>
        </div>
        <AddClassDialog courses={courses} teachers={teachers} />
      </div>

      {/* Recherche instantanée */}
      <div className="relative w-full sm:max-w-xs">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher par nom, cours..."
          aria-label="Rechercher une classe"
          className="pl-8"
        />
      </div>

      {hasClasses ? (
        hasResults ? (
          <>
            {/* Grille de cartes de classes */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredClasses.map((klass) => (
                <ClassCard
                  key={klass.id}
                  klass={klass}
                  onEdit={setEditingClass}
                  onDelete={handleDeleteClass}
                />
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              {filteredClasses.length} classe sur {classes.length}
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
            <LayersIcon className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium">Aucune classe pour le moment</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Créez votre première classe avec le bouton « Nouvelle classe » :
            elle rattache un cours à un créneau horaire et regroupe les
            étudiants{" "}
            {"d'une"}{" "}même cohorte.
          </p>
        </div>
      )}

      {/* Modale d'édition pré-remplie */}
      <EditClassDialog
        klass={editingClass}
        courses={courses}
        teachers={teachers}
        open={editingClass !== null}
        onOpenChange={(open) => {
          if (!open) setEditingClass(null);
        }}
      />
    </div>
  );
}