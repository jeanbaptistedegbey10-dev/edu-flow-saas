"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2Icon, SaveIcon } from "lucide-react";

import {
  updateCourseAction,
  type CourseDTO,
  type CourseFormState,
  type TeacherDTO,
} from "@/actions/courses";
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

/** Valeur sentinelle pour les champs Select optionnels (Radix interdit ""). */
const NONE_VALUE = "__none__";

const INITIAL_FORM_STATE: CourseFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/**
 * Formulaire d'édition isolé par entité (`key={course.id}` côté parent)
 * afin de réinitialiser l'état du formulaire à chaque ouverture.
 */
function EditCourseForm({
  course,
  teachers,
  onSuccess,
}: {
  course: CourseDTO;
  teachers: TeacherDTO[];
  onSuccess: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prevState: CourseFormState, rawFormData: FormData) => {
      // Clone les entrées puis convertit la sentinelle « non attribué »
      // en chaîne vide attendue par l'action serveur.
      const formData = new FormData();
      for (const [key, value] of rawFormData.entries()) {
        formData.append(key, value);
      }

      if (String(formData.get("teacherId") ?? "") === NONE_VALUE) {
        formData.set("teacherId", "");
      }

      const result = await updateCourseAction(_prevState, formData);

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
        <DialogTitle>Modifier le cours</DialogTitle>
        <DialogDescription>
          Mettez à jour la fiche du cours «&nbsp;{course.title}&nbsp;»
          ({course.code}).
        </DialogDescription>
      </DialogHeader>

      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="id" value={course.id} />

        {state.message && state.status === "error" && !state.fieldErrors ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.message}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-title">Intitulé *</Label>
            <Input
              id="edit-title"
              name="title"
              defaultValue={course.title}
              maxLength={150}
              required
              aria-invalid={Boolean(fieldErrors.title)}
            />
            <FieldError message={fieldErrors.title} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-code">Code *</Label>
            <Input
              id="edit-code"
              name="code"
              defaultValue={course.code}
              maxLength={20}
              className="uppercase"
              required
              aria-invalid={Boolean(fieldErrors.code)}
            />
            <FieldError message={fieldErrors.code} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-price">Prix (FCFA) *</Label>
            <Input
              id="edit-price"
              name="price"
              type="number"
              inputMode="decimal"
              min="1"
              step="any"
              defaultValue={course.price}
              required
              aria-invalid={Boolean(fieldErrors.price)}
            />
            <FieldError message={fieldErrors.price} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="edit-durationWeeks">Durée (semaines) *</Label>
            <Input
              id="edit-durationWeeks"
              name="durationWeeks"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              defaultValue={course.durationWeeks}
              required
              aria-invalid={Boolean(fieldErrors.durationWeeks)}
            />
            <FieldError message={fieldErrors.durationWeeks} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-teacherId">Enseignant</Label>
          <Select
            name="teacherId"
            defaultValue={course.teacher?.id ?? NONE_VALUE}
          >
            <SelectTrigger
              id="edit-teacherId"
              className="w-full"
              aria-invalid={Boolean(fieldErrors.teacherId)}
            >
              <SelectValue placeholder="Non attribué" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>— Non attribué —</SelectItem>
              {teachers.map((teacher) => (
                <SelectItem key={teacher.id} value={teacher.id}>
                  {teacher.firstName} {teacher.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError message={fieldErrors.teacherId} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-description">Description</Label>
          <Input
            id="edit-description"
            name="description"
            defaultValue={course.description ?? ""}
            maxLength={500}
            aria-invalid={Boolean(fieldErrors.description)}
          />
          <FieldError message={fieldErrors.description} />
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
 * Modale d'édition pré-remplie d'un cours.
 * Contrôlée par la vue parente (`open` + `onOpenChange`).
 */
export function EditCourseDialog({
  course,
  teachers,
  open,
  onOpenChange,
}: {
  course: CourseDTO | null;
  teachers: TeacherDTO[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {course ? (
          <EditCourseForm
            key={course.id}
            course={course}
            teachers={teachers}
            onSuccess={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}