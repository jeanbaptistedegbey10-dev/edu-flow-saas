"use client";

import * as React from "react";
import { useActionState } from "react";
import { CalendarClockIcon, Loader2Icon, PlusIcon } from "lucide-react";

import type { CourseDTO, TeacherDTO } from "@/actions/courses";
import {
  createClassAction,
  type ClassFormState,
} from "@/actions/classes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

const INITIAL_FORM_STATE: ClassFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

export function AddClassDialog({
  courses,
  teachers,
}: {
  courses: CourseDTO[];
  teachers: TeacherDTO[];
}) {
  const [open, setOpen] = React.useState(false);

  // Enveloppe l'action serveur pour fermer la modale dès que la création réussit.
  const [state, formAction, pending] = useActionState(
    async (_prevState: ClassFormState, formData: FormData) => {
      const result = await createClassAction(_prevState, formData);

      if (result.status === "success") {
        setOpen(false);
      }

      return result;
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Nouvelle classe
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter une classe</DialogTitle>
          <DialogDescription>
            Créez une cohorte rattachée à un cours avec son créneau horaire
            (ex : « A1 - Matin », « 08h-11h »).
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          {state.message && state.status === "error" && !state.fieldErrors ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.message}
            </p>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor="class-name">Nom de la classe *</Label>
            <Input
              id="class-name"
              name="name"
              placeholder="Ex : A1 - Matin"
              maxLength={100}
              required
              aria-invalid={Boolean(fieldErrors.name)}
            />
            <FieldError message={fieldErrors.name} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="class-schedule">Créneau horaire *</Label>
            <Input
              id="class-schedule"
              name="schedule"
              placeholder="Ex : 08h-11h"
              maxLength={100}
              required
              aria-invalid={Boolean(fieldErrors.schedule)}
            />
            <FieldError message={fieldErrors.schedule} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="class-course">Cours *</Label>
            <Select name="courseId">
              <SelectTrigger id="class-course" className="w-full">
                <SelectValue placeholder="Sélectionner un cours" />
              </SelectTrigger>
              <SelectContent>
                {courses.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.title} ({course.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.courseId} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="class-teacher">Enseignant</Label>
            <Select name="teacherId">
              <SelectTrigger id="class-teacher" className="w-full">
                <SelectValue placeholder="Non attribué (facultatif)" />
              </SelectTrigger>
              <SelectContent>
                {teachers.map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id}>
                    {teacher.firstName} {teacher.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fieldErrors.teacherId} />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Annuler
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || courses.length === 0}>
              {pending ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <CalendarClockIcon data-icon="inline-start" />
              )}
              {pending ? "Création..." : "Créer la classe"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}