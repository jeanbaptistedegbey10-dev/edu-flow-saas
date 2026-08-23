"use client";

import * as React from "react";
import {
  CalendarIcon,
  CircleUserRoundIcon,
  ClipboardListIcon,
  EllipsisIcon,
  LayoutGridIcon,
  ListIcon,
  SearchIcon,
  TriangleAlertIcon,
  UserRoundIcon,
} from "lucide-react";

import {
  updateTaskStatusAction,
  type StaffMemberDTO,
  type TaskDTO,
} from "@/actions/tasks";
import { deleteTaskAction } from "@/actions/tasks";
import { AddTaskDialog } from "@/components/tasks/add-task-dialog";
import { EditTaskDialog } from "@/components/tasks/edit-task-dialog";
import { EntityActionsMenu } from "@/components/shared/entity-actions-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getTaskPriorityBadgeClass,
  getTaskPriorityLabel,
} from "@/lib/task-priority";
import {
  TASK_STATUS_ORDER,
  getTaskStatusBadgeClass,
  getTaskStatusLabel,
} from "@/lib/task-status";
import { cn } from "@/lib/utils";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation. Les échéances sont stockées à minuit UTC.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

type ViewMode = "kanban" | "list";
type PriorityFilter = "ALL" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type AssigneeFilter = "ALL" | "UNASSIGNED" | string;

const PRIORITY_FILTERS = [
  { value: "ALL", label: "Toutes" },
  { value: "URGENT", label: "Urgente" },
  { value: "HIGH", label: "Haute" },
  { value: "MEDIUM", label: "Moyenne" },
  { value: "LOW", label: "Basse" },
] as const;

/** Initiales affichées dans les puces d'assignation. */
function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/**
 * Détermine si l'échéance d'une tâche est dépassée (comparaison sur les
 * jours UTC, les dates étant stockées à minuit UTC). Les tâches terminées
 * ne sont jamais signalées en retard.
 */
function isOverdue(task: TaskDTO): boolean {
  if (!task.dueDate || task.status === "DONE") return false;

  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );

  return task.dueDate.getTime() < todayUtc;
}

// --------------------------------------
// Menu de changement rapide de statut
// --------------------------------------

function TaskStatusMenu({
  task,
  onStatusChange,
}: {
  task: TaskDTO;
  onStatusChange: (taskId: string, status: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Changer le statut de « ${task.title} »`}
        >
          <EllipsisIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Changer le statut</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {TASK_STATUS_ORDER.map((status) => (
          <DropdownMenuItem
            key={status}
            disabled={status === task.status}
            onSelect={() => onStatusChange(task.id, status)}
          >
            {getTaskStatusLabel(status)}
            {status === task.status ? (
              <span className="ml-auto text-xs text-muted-foreground">
                Actuel
              </span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// --------------------------------------
// Carte de tâche (vue Kanban)
// --------------------------------------

function TaskCard({
  task,
  onStatusChange,
  onEdit,
}: {
  task: TaskDTO;
  onStatusChange: (taskId: string, status: string) => void;
  onEdit: (task: TaskDTO) => void;
}) {
  const overdue = isOverdue(task);

  return (
    <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md dark:border-slate-800 dark:from-card dark:to-card">
      <div className="flex items-start justify-between gap-2 p-3 pb-2">
        <p className="text-sm font-medium leading-snug">{task.title}</p>
        <div className="flex shrink-0 items-center gap-0.5">
          <TaskStatusMenu task={task} onStatusChange={onStatusChange} />
          <EntityActionsMenu
            entityName={`la tâche « ${task.title} »`}
            onEdit={() => onEdit(task)}
            onDelete={() => deleteTaskAction(task.id)}
          />
        </div>
      </div>

      {task.description ? (
        <p className="line-clamp-2 px-3 text-xs text-muted-foreground">
          {task.description}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
        <span
          className={cn(
            BADGE_BASE_CLASSES,
            getTaskPriorityBadgeClass(task.priority)
          )}
        >
          {getTaskPriorityLabel(task.priority)}
        </span>
        {overdue ? (
          <span
            className={cn(
              BADGE_BASE_CLASSES,
              "border border-red-200/60 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400"
            )}
          >
            <TriangleAlertIcon className="mr-1 size-3" aria-hidden="true" />
            En retard
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
        {/* Membre assigné */}
        {task.assignee ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
              {getInitials(task.assignee.firstName, task.assignee.lastName)}
            </span>
            <span className="truncate">
              {task.assignee.firstName} {task.assignee.lastName}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70">
            <UserRoundIcon className="size-3.5" aria-hidden="true" />
            Non assignée
          </span>
        )}

        {/* Échéance */}
        {task.dueDate ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs",
              overdue
                ? "font-medium text-red-700 dark:text-red-400"
                : "text-muted-foreground"
            )}
          >
            <CalendarIcon className="size-3.5" aria-hidden="true" />
            {dateFormatter.format(task.dueDate)}
          </span>
        ) : null}
      </div>

      {/* Étudiant concerné */}
      {task.student ? (
        <div className="flex items-center gap-1.5 border-t px-3 py-2 text-xs text-muted-foreground">
          <CircleUserRoundIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            Étudiant : {task.student.firstName} {task.student.lastName} (
            {task.student.studentCode})
          </span>
        </div>
      ) : null}
    </div>
  );
}

// --------------------------------------
// Vue Kanban
// --------------------------------------

function KanbanView({
  tasks,
  onStatusChange,
  onEdit,
}: {
  tasks: TaskDTO[];
  onStatusChange: (taskId: string, status: string) => void;
  onEdit: (task: TaskDTO) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {TASK_STATUS_ORDER.map((status) => {
        const columnTasks = tasks.filter((task) => task.status === status);

        return (
          <section
            key={status}
            aria-label={getTaskStatusLabel(status)}
            className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3"
          >
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold">
                {getTaskStatusLabel(status)}
              </h3>
              <span
                className={cn(
                  BADGE_BASE_CLASSES,
                  getTaskStatusBadgeClass(status)
                )}
              >
                {columnTasks.length}
              </span>
            </div>

            {columnTasks.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                Aucune tâche
              </p>
            ) : (
              columnTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onStatusChange={onStatusChange}
                  onEdit={onEdit}
                />
              ))
            )}
          </section>
        );
      })}
    </div>
  );
}

// --------------------------------------
// Vue Liste
// --------------------------------------

function ListView({
  tasks,
  onStatusChange,
  onEdit,
}: {
  tasks: TaskDTO[];
  onStatusChange: (taskId: string, status: string) => void;
  onEdit: (task: TaskDTO) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Tâche</TableHead>
          <TableHead>Priorité</TableHead>
          <TableHead>Assignée à</TableHead>
          <TableHead>Étudiant</TableHead>
          <TableHead>Échéance</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead className="text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => {
          const overdue = isOverdue(task);

          return (
            <TableRow key={task.id}>
              <TableCell>
                <div className="flex max-w-xs flex-col gap-0.5">
                  <span className="font-medium">{task.title}</span>
                  {task.description ? (
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {task.description}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    BADGE_BASE_CLASSES,
                    getTaskPriorityBadgeClass(task.priority)
                  )}
                >
                  {getTaskPriorityLabel(task.priority)}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {task.assignee
                  ? `${task.assignee.firstName} ${task.assignee.lastName}`
                  : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {task.student
                  ? `${task.student.firstName} ${task.student.lastName}`
                  : "—"}
              </TableCell>
              <TableCell>
                {task.dueDate ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      overdue
                        ? "font-medium text-red-700 dark:text-red-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {overdue ? (
                      <TriangleAlertIcon
                        className="size-3.5"
                        aria-hidden="true"
                      />
                    ) : null}
                    {dateFormatter.format(task.dueDate)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <span
                    className={cn(
                      BADGE_BASE_CLASSES,
                      getTaskStatusBadgeClass(task.status)
                    )}
                  >
                    {getTaskStatusLabel(task.status)}
                  </span>
                  <TaskStatusMenu task={task} onStatusChange={onStatusChange} />
                </div>
              </TableCell>
              <TableCell className="text-right">
                <EntityActionsMenu
                  entityName={`la tâche « ${task.title} »`}
                  onEdit={() => onEdit(task)}
                  onDelete={() => deleteTaskAction(task.id)}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// --------------------------------------
// Vue principale : barre d'outils + Kanban/Liste
// --------------------------------------

export function TasksView({
  tasks,
  staffMembers,
  students,
}: {
  tasks: TaskDTO[];
  staffMembers: StaffMemberDTO[];
  students: Parameters<typeof AddTaskDialog>[0]["students"];
}) {
  const [view, setView] = React.useState<ViewMode>("kanban");
  const [search, setSearch] = React.useState("");
  const [priorityFilter, setPriorityFilter] =
    React.useState<PriorityFilter>("ALL");
  const [assigneeFilter, setAssigneeFilter] =
    React.useState<AssigneeFilter>("ALL");
  const [editingTask, setEditingTask] = React.useState<TaskDTO | null>(null);
  const [, startTransition] = React.useTransition();

  const filteredTasks = React.useMemo(() => {
    const query = search.trim().toLowerCase();

    return tasks.filter((task) => {
      if (priorityFilter !== "ALL" && task.priority !== priorityFilter) {
        return false;
      }

      if (assigneeFilter === "UNASSIGNED" && task.assignee) {
        return false;
      }
      if (
        assigneeFilter !== "ALL" &&
        assigneeFilter !== "UNASSIGNED" &&
        task.assignee?.id !== assigneeFilter
      ) {
        return false;
      }

      if (!query) return true;

      return (
        task.title.toLowerCase().includes(query) ||
        (task.description?.toLowerCase().includes(query) ?? false) ||
        (task.assignee
          ? `${task.assignee.firstName} ${task.assignee.lastName}`
              .toLowerCase()
              .includes(query)
          : false) ||
        (task.student
          ? `${task.student.firstName} ${task.student.lastName} ${task.student.studentCode}`
              .toLowerCase()
              .includes(query)
          : false)
      );
    });
  }, [tasks, search, priorityFilter, assigneeFilter]);

  const hasTasks = tasks.length > 0;
  const hasResults = filteredTasks.length > 0;

  // Changement de statut optimiste côté transition : l'action serveur
  // appelle `revalidatePath`, ce qui rafraîchit les données de la page.
  const handleStatusChange = React.useCallback(
    (taskId: string, status: string) => {
      startTransition(async () => {
        await updateTaskStatusAction(taskId, status);
      });
    },
    []
  );

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Tâches</h2>
          <p className="text-sm text-muted-foreground">
            Organisez le travail de votre équipe et suivez l’avancement des
            dossiers.
          </p>
        </div>
        <AddTaskDialog staffMembers={staffMembers} students={students} />
      </div>

      {/* Carte : barre d'outils + contenu */}
      <div className="rounded-xl border border-slate-200/80 bg-card text-card-foreground shadow-sm transition-all duration-200 dark:border-slate-800">
        <div className="flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between">
          {/* Recherche instantanée */}
          <div className="relative w-full xl:max-w-xs">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher par titre, membre, étudiant..."
              aria-label="Rechercher une tâche"
              className="pl-8"
            />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {/* Filtres par priorité */}
            <div
              role="group"
              aria-label="Filtrer par priorité"
              className="flex flex-wrap items-center gap-1"
            >
              {PRIORITY_FILTERS.map((filter) => {
                const isActive = priorityFilter === filter.value;

                return (
                  <Button
                    key={filter.value}
                    type="button"
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={isActive}
                    onClick={() =>
                      setPriorityFilter(filter.value as PriorityFilter)
                    }
                  >
                    {filter.label}
                  </Button>
                );
              })}
            </div>

            {/* Filtre par assigné */}
            <div className="grid gap-1.5">
              <Label
                htmlFor="assignee-filter"
                className="sr-only"
              >
                Filtrer par membre assigné
              </Label>
              <Select
                value={assigneeFilter}
                onValueChange={(value) => setAssigneeFilter(value)}
              >
                <SelectTrigger id="assignee-filter" className="w-full lg:w-48">
                  <SelectValue placeholder="Tous les membres" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tous les membres</SelectItem>
                  <SelectItem value="UNASSIGNED">Non assignées</SelectItem>
                  {staffMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.firstName} {member.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bascule Vue Kanban / Vue Liste */}
            <div
              role="group"
              aria-label="Mode d'affichage"
              className="flex items-center gap-1 rounded-lg border p-1"
            >
              <Button
                type="button"
                variant={view === "kanban" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={view === "kanban"}
                onClick={() => setView("kanban")}
              >
                <LayoutGridIcon data-icon="inline-start" />
                Kanban
              </Button>
              <Button
                type="button"
                variant={view === "list" ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                <ListIcon data-icon="inline-start" />
                Liste
              </Button>
            </div>
          </div>
        </div>

        {hasTasks ? (
          hasResults ? (
            view === "kanban" ? (
              <div className="p-4">
                <KanbanView
                  tasks={filteredTasks}
                  onStatusChange={handleStatusChange}
                  onEdit={setEditingTask}
                />
              </div>
            ) : (
              <ListView
                tasks={filteredTasks}
                onStatusChange={handleStatusChange}
                onEdit={setEditingTask}
              />
            )
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
              <SearchIcon className="size-8 text-muted-foreground/50" />
              <p className="text-sm font-medium">Aucun résultat trouvé</p>
              <p className="text-sm text-muted-foreground">
                Essayez un autre terme de recherche ou modifiez les filtres.
              </p>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <ClipboardListIcon className="size-6 text-muted-foreground" />
            </div>
            <p className="font-medium">Aucune tâche pour le moment</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Créez votre première tâche avec le bouton « Nouvelle tâche »
              pour organiser le travail de votre équipe.
            </p>
          </div>
        )}

        {hasTasks && hasResults ? (
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">
            {filteredTasks.length} tâche{filteredTasks.length > 1 ? "s" : ""}{" "}
            sur {tasks.length}
          </div>
        ) : null}
      </div>

      {/* Modale d'édition pré-remplie */}
      <EditTaskDialog
        task={editingTask}
        staffMembers={staffMembers}
        students={students}
        open={editingTask !== null}
        onOpenChange={(open) => {
          if (!open) setEditingTask(null);
        }}
      />
    </div>
  );
}