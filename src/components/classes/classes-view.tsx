"use client";

import * as React from "react";
import Link from "next/link";
import {
  BookOpenIcon,
  CalendarClockIcon,
  ClipboardListIcon,
  ClockIcon,
  GraduationCapIcon,
  LayersIcon,
  SearchIcon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react";

import type { CourseDTO, TeacherDTO } from "@/actions/courses";
import { deleteClassAction, type ClassDTO } from "@/actions/classes";
import { AddClassDialog } from "@/components/classes/add-class-dialog";
import { ClassArchiveButton } from "@/components/classes/class-archive-button";
import { ClassCardSessionActions } from "@/components/classes/class-card-session-actions";
import { ClassUnarchiveButton } from "@/components/classes/class-unarchive-button";
import { EditClassDialog } from "@/components/classes/edit-class-dialog";
import { EntityActionsMenu } from "@/components/shared/entity-actions-menu";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  CLASS_STATUS_BADGE_CLASSES,
  CLASS_STATUS_LABELS,
} from "@/lib/class-status";
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
  canManageLifecycle,
  onEdit,
  onDelete,
}: {
  klass: ClassDTO;
  /** Actes de gestion (« Démarrer la classe ») : administrateurs uniquement. */
  canManageLifecycle: boolean;
  onEdit: (klass: ClassDTO) => void;
  onDelete: (klass: ClassDTO) => Promise<{ ok: boolean; message?: string }>;
}) {
  // Classe archivée : lecture seule — pas d'édition/suppression, pas
  // d'émargement ni de cahier de texte. Badge explicite « Archivée ».
  const isArchived = klass.status === "ARCHIVED";

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:from-card dark:to-card",
        isArchived && "opacity-80"
      )}
    >
      <div className="flex flex-col gap-2 p-4">
        {/* Nom + actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-medium tracking-wide">
              {klass.courseCode}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                CLASS_STATUS_BADGE_CLASSES[klass.status]
              )}
            >
              {CLASS_STATUS_LABELS[klass.status]}
            </span>
            {isArchived && (
              <span className="inline-flex items-center rounded-full border border-amber-200/60 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                Lecture seule
              </span>
            )}
          </div>

          {/* Lecture seule : aucune action d'édition / suppression pour une
              classe archivée (l'historique reste consultable). */}
          {isArchived ? null : (
            <EntityActionsMenu
              entityName={`la classe « ${klass.name} »`}
              onEdit={() => onEdit(klass)}
              onDelete={() => onDelete(klass)}
            />
          )}
        </div>

        {/* Accès direct à la vue unifiée « Présences & Cahier de texte » :
            le nom de la classe mène désormais à la SEULE vue de classe
            existante (l'ancienne fiche détaillée a été supprimée). */}
        <Link
          href={`/dashboard/attendance?classId=${klass.id}`}
          className="font-semibold leading-snug hover:underline"
        >
          {klass.name}
        </Link>

        <p className="text-sm text-muted-foreground">{klass.courseTitle}</p>
      </div>

      {/* Métadonnées : créneau, enseignant, effectif */}
      <div className="mt-auto flex flex-col gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <ClockIcon className="size-4 shrink-0" />
          <span>{klass.schedule}</span>
        </div>

        {klass.schedules.length > 0 && (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            {klass.schedules.map((s) => (
              <span key={s.id} className="flex items-center gap-1">
                <span className="font-medium">{["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"][s.dayOfWeek]}</span>
                <span>{s.startTime}–{s.endTime}</span>
                {s.room && <span className="text-muted-foreground/70">• {s.room}</span>}
              </span>
            ))}
          </div>
        )}

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

        {/* Émargement / cahier de texte : action principale de la carte pour
            tous les rôles. « Démarrer la classe » reste réservé aux admins.
            Une classe archivée est en lecture seule : aucun acte de saisie —
            seule l'action inverse « Désarchiver la classe » reste proposée,
            aux rôles administratifs (ADMIN / SUPER_ADMIN). */}
        {isArchived ? (
          <ClassUnarchiveButton
            classId={klass.id}
            className={klass.name}
            status={klass.status}
            canManageLifecycle={canManageLifecycle}
            wrapperClassName="mt-1 flex flex-col gap-1.5"
          />
        ) : (
          <>
            <ClassCardSessionActions
              classId={klass.id}
              status={klass.status}
              canManageLifecycle={canManageLifecycle}
              className="mt-1"
            />
            {/* Classe CLÔTURÉE (COMPLETED) : action de fin de vie explicite
                « Archiver la classe » (rendue pour les rôles administratifs
                uniquement, cf. `canManageClassLifecycle`). Elle est bloquée
                tant que les 3 prérequis pédagogiques ne sont pas réunis
                (présences émargées, cahier de texte, évaluations notées).
                Une fois archivée, la classe bascule en lecture seule et rejoint
                l'onglet « Archives » ; elle est exclue de l'émargement. */}
            <ClassArchiveButton
              classId={klass.id}
              className={klass.name}
              status={klass.status}
              canManageLifecycle={canManageLifecycle}
            />
            <Link
              href={`/dashboard/attendance?classId=${klass.id}`}
              className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <ClipboardListIcon className="size-4" />
              Présences & Cahier de texte
            </Link>
          </>
        )}
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
  canManageLifecycle = false,
  filteredCourse = null,
}: {
  classes: ClassDTO[];
  courses: CourseDTO[];
  teachers: TeacherDTO[];
  /** Actes de gestion (« Démarrer la classe ») : administrateurs uniquement. */
  canManageLifecycle?: boolean;
  /**
   * Cours porteur d'un filtre actif (`/dashboard/classes?courseId=...`,
   * accessible via les cartes de cours). `null` = toutes les classes.
   */
  filteredCourse?: CourseDTO | null;
}) {
  const [search, setSearch] = React.useState("");
  const [editingClass, setEditingClass] = React.useState<ClassDTO | null>(
    null
  );
  /**
   * Onglet actif : « actives » (toutes classes non archivées, défaut) ou
   * « archives » (classes ARCHIVED en lecture seule).
   */
  const [showArchived, setShowArchived] = React.useState(false);

  /**
   * Classes affichées : filtre structurel « par cours » (query param
   * `courseId`, activé par le bouton « Accéder aux classes concernées » des
   * cartes de cours) cumulé avec l'onglet Actives/Archives et la recherche
   * textuelle instantanée.
   */
  const filteredClasses = React.useMemo(() => {
    // 1) Onglet : classes actives (non archivées) ou classes archivées.
    //    Par défaut, les classes archivées sont masquées (exploitation courante
    //    uniquement) — consultables via l'onglet « Archives ».
    const lifecycleClasses = showArchived
      ? classes.filter((klass) => klass.status === "ARCHIVED")
      : classes.filter((klass) => klass.status !== "ARCHIVED");

    // 2) Périmètre par cours, le cas échéant.
    const scopedClasses = filteredCourse
      ? lifecycleClasses.filter((klass) => klass.courseId === filteredCourse.id)
      : lifecycleClasses;

    // 3) Recherche textuelle par nom de classe, cours ou enseignant.
    const query = search.trim().toLowerCase();

    if (!query) return scopedClasses;

    return scopedClasses.filter((klass) => {
      return (
        klass.name.toLowerCase().includes(query) ||
        klass.courseTitle.toLowerCase().includes(query) ||
        klass.courseCode.toLowerCase().includes(query) ||
        (klass.teacherName ?? "").toLowerCase().includes(query)
      );
    });
  }, [classes, filteredCourse, search, showArchived]);

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

      {/* Onglets Actives / Archives : par défaut seules les classes non
          archivées sont affichées ; l'onglet « Archives » donne accès aux
          classes ARCHIVED en lecture seule (pas d'émargement ni
          d'évaluations, pas de modification). */}
      <Tabs
        value={showArchived ? "archived" : "active"}
        onValueChange={(value) => setShowArchived(value === "archived")}
      >
        <TabsList>
          <TabsTrigger value="active">Classes Actives</TabsTrigger>
          <TabsTrigger value="archived">Archives</TabsTrigger>
        </TabsList>
      </Tabs>

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

      {/* Bannière : vue filtrée par un cours (depuis « Accéder aux classes
          concernées » sur les cartes de cours). */}
      {filteredCourse ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
        >
          <Badge variant="secondary" className="gap-1.5">
            <LayersIcon className="size-3.5" />
            Cours : {filteredCourse.title}
          </Badge>
          <span className="text-muted-foreground">
            Vue filtrée — seules les classes rattachées à ce cours sont
            affichées.
          </span>
          <Link
            href="/dashboard/classes"
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <XIcon className="size-3.5" />
            Retirer le filtre
          </Link>
        </div>
      ) : null}

      {hasClasses ? (
        hasResults ? (
          <>
            {/* Grille de cartes de classes */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredClasses.map((klass) => (
                <ClassCard
                  key={klass.id}
                  klass={klass}
                  canManageLifecycle={canManageLifecycle}
                  onEdit={setEditingClass}
                  onDelete={handleDeleteClass}
                />
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              {filteredCourse
                ? `${filteredClasses.length} classe${filteredClasses.length > 1 ? "s" : ""} du cours « ${filteredCourse.title} » sur ${classes.length}`
                : `${filteredClasses.length} classe sur ${classes.length}`}
            </p>
          </>
        ) : filteredCourse ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
            <BookOpenIcon className="size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Aucune classe pour ce cours</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Aucune classe n&apos;est rattachée au cours «{" "}
              {filteredCourse.title} »{search.trim() ? " pour cette recherche" : ""}.
            </p>
            <Link
              href="/dashboard/classes"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Voir toutes les classes
            </Link>
          </div>
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