"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2Icon, SaveIcon, ClockIcon, PlusIcon, Trash2Icon, LockKeyholeIcon } from "lucide-react";

import type { CourseDTO, TeacherDTO } from "@/actions/courses";
import {
  updateClassAction,
  type ClassDTO,
  type ClassFormState,
  type ClassScheduleDTO,
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

const INITIAL_FORM_STATE: ClassFormState = { status: "idle" };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/** Jours de la semaine pour le sélecteur de créneau. */
const WEEK_DAYS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 0, label: "Dimanche" },
];

type ScheduleEntry = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room: string;
};

let scheduleCounter = 0;
function newScheduleId() {
  scheduleCounter += 1;
  return `new-${scheduleCounter}`;
}

/**
 * Formulaire d'édition isolé par entité (`key={klass.id}` côté parent)
 * afin de réinitialiser l'état du formulaire à chaque ouverture.
 */
function EditClassForm({
  klass,
  courses,
  teachers,
  onSuccess,
}: {
  klass: ClassDTO;
  courses: CourseDTO[];
  teachers: TeacherDTO[];
  onSuccess: () => void;
}) {
  const [schedules, setSchedules] = React.useState<ScheduleEntry[]>(() =>
    klass.schedules.length > 0
      ? klass.schedules.map((s) => ({
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          room: s.room ?? "",
        }))
      : []
  );

  const [state, formAction, pending] = useActionState(
    async (_prevState: ClassFormState, rawFormData: FormData) => {
      const formData = new FormData();
      for (const [key, value] of rawFormData.entries()) {
        formData.append(key, value);
      }
      if (String(formData.get("teacherId") ?? "") === NONE_VALUE) {
        formData.set("teacherId", "");
      }
      const result = await updateClassAction(_prevState, formData);
      if (result.status === "success") {
        onSuccess();
      }
      return result;
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  const addSchedule = () => {
    setSchedules((prev) => [
      ...prev,
      { id: newScheduleId(), dayOfWeek: 1, startTime: "08:00", endTime: "10:00", room: "" },
    ]);
  };

  const removeSchedule = (id: string) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  };

  const updateSchedule = (id: string, field: keyof ScheduleEntry, value: string | number) => {
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Modifier la classe</DialogTitle>
        <DialogDescription>
          Mettez à jour «&nbsp;{klass.name}&nbsp;» ({klass.schedule}). Les
          étudiants affectés restent inchangés.
        </DialogDescription>
      </DialogHeader>

      <form action={formAction} className="grid max-h-[70vh] gap-4 overflow-y-auto pr-2">
        <input type="hidden" name="id" value={klass.id} />
        <input type="hidden" name="schedulesJson" value={JSON.stringify(schedules.map(({ dayOfWeek, startTime, endTime, room }) => ({ dayOfWeek, startTime, endTime, room })))} />

        {state.message && state.status === "error" && !state.fieldErrors ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {state.message}
          </p>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="edit-class-name">Nom de la classe *</Label>
          <Input id="edit-class-name" name="name" defaultValue={klass.name} maxLength={100} required aria-invalid={Boolean(fieldErrors.name)} />
          <FieldError message={fieldErrors.name} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-class-schedule">Créneau horaire (affichage) *</Label>
          <Input id="edit-class-schedule" name="schedule" defaultValue={klass.schedule} maxLength={100} required aria-invalid={Boolean(fieldErrors.schedule)} />
          <FieldError message={fieldErrors.schedule} />
        </div>

        {/* Créneaux hebdomadaires */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
              <ClockIcon className="size-3.5" />
              Créneaux hebdomadaires
            </Label>
            <Button type="button" variant="outline" size="sm" onClick={addSchedule}>
              <PlusIcon data-icon="inline-start" className="size-3" />
              Ajouter
            </Button>
          </div>
          {schedules.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              Aucun créneau configuré.
            </p>
          ) : (
            <div className="grid gap-2">
              {schedules.map((entry) => (
                <div key={entry.id} className="grid grid-cols-[1fr_90px_90px_1fr_auto] items-end gap-2 rounded-md border bg-muted/20 p-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Jour</Label>
                    <select className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm" value={entry.dayOfWeek} onChange={(e) => updateSchedule(entry.id, "dayOfWeek", Number(e.target.value))}>
                      {WEEK_DAYS.map((day) => (<option key={day.value} value={day.value}>{day.label}</option>))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Début</Label>
                    <Input type="time" value={entry.startTime} onChange={(e) => updateSchedule(entry.id, "startTime", e.target.value)} className="h-9" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Fin</Label>
                    <Input type="time" value={entry.endTime} onChange={(e) => updateSchedule(entry.id, "endTime", e.target.value)} className="h-9" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Salle</Label>
                    <Input value={entry.room} onChange={(e) => updateSchedule(entry.id, "room", e.target.value)} placeholder="Salle 101" className="h-9" />
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeSchedule(entry.id)} aria-label="Supprimer ce créneau">
                    <Trash2Icon className="size-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-class-tuition-fee" className="flex items-center gap-1.5">
            Frais de scolarité (FCFA)
            <LockKeyholeIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </Label>
          <Input
            id="edit-class-tuition-fee"
            name="tuitionFee"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            defaultValue={klass.tuitionFee !== null ? String(klass.tuitionFee) : ""}
            placeholder="Vide = prix du cours porteur"
            aria-invalid={Boolean(fieldErrors.tuitionFee)}
            readOnly
            disabled
            className="cursor-not-allowed bg-muted/50"
            title="Montant verrouillé : défini à la création du cours porteur."
          />
          <FieldError message={fieldErrors.tuitionFee} />
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <LockKeyholeIcon className="size-3 shrink-0" />
            Montant verrouillé à titre indicatif — défini à la création du
            cours porteur, non modifiable ici pour garantir la cohérence
            financière.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="edit-class-course">Cours *</Label>
          <Select name="courseId" defaultValue={klass.courseId}>
            <SelectTrigger id="edit-class-course" className="w-full">
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
          <Label htmlFor="edit-class-teacher">Enseignant</Label>
          <Select
            name="teacherId"
            defaultValue={klass.teacherId ?? NONE_VALUE}
          >
            <SelectTrigger id="edit-class-teacher" className="w-full">
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

        <DialogFooter className="sticky bottom-0 z-20 -mx-4 -mb-4 border-t bg-background pt-3">
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
 * Modale d'édition pré-remplie d'une classe.
 * Contrôlée par la vue parente (`open` + `onOpenChange`) ; le contenu est
 * remonté à chaque changement d'entité grâce à la clé React.
 */
export function EditClassDialog({
  klass,
  courses,
  teachers,
  open,
  onOpenChange,
}: {
  klass: ClassDTO | null;
  courses: CourseDTO[];
  teachers: TeacherDTO[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {klass ? (
          <EditClassForm
            key={klass.id}
            klass={klass}
            courses={courses}
            teachers={teachers}
            onSuccess={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}