"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2Icon, SaveIcon } from "lucide-react";

import {
  updateTaskAction,
  type StaffMemberDTO,
  type TaskDTO,
  type TaskFormState,
  type TaskStudentOptionDTO,
} from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TASK_PRIORITY_LABELS, TASK_PRIORITY_RANK } from "@/lib/task-priority";
import { TASK_STATUS_LABELS, TASK_STATUS_ORDER } from "@/lib/task-status";

/** Valeur sentinelle pour les champs Select optionnels (Radix interdit ""). */
const NONE_VALUE = "__none__";

const INITIAL_FORM_STATE: TaskFormState = { status: "idle" };

/** Toutes les priorités (y compris URGENT, absent des options de création). */
const PRIORITY_OPTIONS = Object.keys(TASK_PRIORITY_RANK) as Array<
  keyof typeof TASK_PRIORITY_RANK
>;

/** Formate une échéance (minuit UTC) au format attendu par `<input type="date">`. */
function formatDueDate(dueDate: Date): string {
  return dueDate.toISOString().slice(0, 10);
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/**
 * Formulaire d'édition isolé par entité (`key={task.id}` côté parent)
 * afin de réinitialiser l'état du formulaire à chaque ouverture.
 */
function EditTaskForm({
  task,
  staffMembers,
  students,
  onSuccess,
}: {
  task: TaskDTO;
  staffMembers: StaffMemberDTO[];
  students: TaskStudentOptionDTO[];
  onSuccess: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prevState: TaskFormState, rawFormData: FormData) => {
      // Clone les entrées puis convertit les sentinelles « non attribué »
      // en chaînes vides attendues par l'action serveur.
      const formData = new FormData();
      for (const [key, value] of rawFormData.entries()) {
        formData.append(key, value);
      }

      for (const field of ["assigneeId", "studentId"]) {
        if (String(formData.get(field) ?? "") === NONE_VALUE) {
          formData.set(field, "");
        }
      }

      const result = await updateTaskAction(_prevState, formData);

      if (result.status === "success") {
        onSuccess();
      }

      return result;
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <>
      <DialogHeader>
        <DialogTitle>Modifier la tâche</DialogTitle>
        <DialogDescription>
          Mettez à jour les informations de la tâche «&nbsp;{task.title}
          &nbsp;».
        </DialogDescription>
      </DialogHeader>

      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="id" value={task.id} />

        {state.message && state.status === "error" && !state.fieldErrors ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.message}
          </p>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="edit-task-title">Intitulé *</Label>
          <Input
            id="edit-task-title"
            name="title"
            defaultValue={task.title}
            maxLength={150}
            required
            aria-invalid={Boolean(fieldErrors.title)}
          />
          <FieldError message={fieldErrors.title} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-task-description">Description</Label>
          <Input
            id="edit-task-description"
            name="description"
            defaultValue={task.description ?? ""}
            maxLength={500}
            aria-invalid={Boolean(fieldErrors.description)}
          />
          <FieldError message={fieldErrors.description} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-task-priority">Priorité *</Label>
            <Select name="priority" defaultValue={task.priority}>
              <SelectTrigger
                id="edit-task-priority"
                className="w-full"
                aria-invalid={Boolean(fieldErrors.priority)}
              >
                <SelectValue placeholder="Sélectionner une priorité" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {TASK_PRIORITY_LABELS[priority]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.priority} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-task-status">Statut</Label>
            <Select name="status" defaultValue={task.status}>
              <SelectTrigger id="edit-task-status" className="w-full">
                <SelectValue placeholder="Sélectionner un statut" />
              </SelectTrigger>
              <SelectContent>
                {TASK_STATUS_ORDER.map((status) => (
                  <SelectItem key={status} value={status}>
                    {TASK_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.status} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-task-dueDate">Date d’échéance</Label>
          <Input
            id="edit-task-dueDate"
            name="dueDate"
            type="date"
            defaultValue={task.dueDate ? formatDueDate(task.dueDate) : ""}
            aria-invalid={Boolean(fieldErrors.dueDate)}
          />
          <FieldError message={fieldErrors.dueDate} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-task-assigneeId">Membre de l’équipe</Label>
            <Select
              name="assigneeId"
              defaultValue={task.assignee?.id ?? NONE_VALUE}
            >
              <SelectTrigger
                id="edit-task-assigneeId"
                className="w-full"
                aria-invalid={Boolean(fieldErrors.assigneeId)}
              >
                <SelectValue placeholder="Non assignée" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>— Non assignée —</SelectItem>
                {staffMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.firstName} {member.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.assigneeId} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-task-studentId">Étudiant associé</Label>
            <Select
              name="studentId"
              defaultValue={task.student?.id ?? NONE_VALUE}
            >
              <SelectTrigger
                id="edit-task-studentId"
                className="w-full"
                aria-invalid={Boolean(fieldErrors.studentId)}
              >
                <SelectValue placeholder="Aucun" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>— Aucun —</SelectItem>
                {students.map((student) => (
                  <SelectItem key={student.id} value={student.id}>
                    {student.firstName} {student.lastName} (
                    {student.studentCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.studentId} />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Annuler
            </Button>
          </DialogClose>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
            ) : (
              <SaveIcon data-icon="inline-start" />
            )}
            {pending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/**
 * Modale d'édition pré-remplie d'une tâche.
 * Contrôlée par la vue parente (`open` + `onOpenChange`).
 */
export function EditTaskDialog({
  task,
  staffMembers,
  students,
  open,
  onOpenChange,
}: {
  task: TaskDTO | null;
  staffMembers: StaffMemberDTO[];
  students: TaskStudentOptionDTO[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {task ? (
          <EditTaskForm
            key={task.id}
            task={task}
            staffMembers={staffMembers}
            students={students}
            onSuccess={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}