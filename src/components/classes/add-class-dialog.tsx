"use client";

import * as React from "react";
import { useActionState } from "react";
import { CalendarClockIcon, Loader2Icon, PlusIcon, Trash2Icon, ClockIcon } from "lucide-react";

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

export function AddClassDialog({
  courses,
  teachers,
}: {
  courses: CourseDTO[];
  teachers: TeacherDTO[];
}) {
  const [open, setOpen] = React.useState(false);
  const [schedules, setSchedules] = React.useState<ScheduleEntry[]>([]);

  const [state, formAction, pending] = useActionState(
    async (_prevState: ClassFormState, formData: FormData) => {
      const result = await createClassAction(_prevState, formData);
      if (result.status === "success") {
        setOpen(false);
        setSchedules([]);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Nouvelle classe
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter une classe</DialogTitle>
          <DialogDescription>
            Créez une cohorte rattachée à un cours avec ses créneaux horaires
            (ex : « A1 - Matin 1 », Lundi 08h-11h en Salle 101).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          {state.message && state.status === "error" ? (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.message}
            </p>
          ) : null}
          <input type="hidden" name="schedulesJson" value={JSON.stringify(schedules.map(({ dayOfWeek, startTime, endTime, room }) => ({ dayOfWeek, startTime, endTime, room })))} />
          <div className="grid gap-2">
            <Label htmlFor="class-name">Nom de la classe *</Label>
            <Input id="class-name" name="name" placeholder="Ex : A1 - Matin 1" maxLength={100} required aria-invalid={Boolean(fieldErrors.name)} />
            <FieldError message={fieldErrors.name} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="class-schedule">Créneau horaire (affichage) *</Label>
            <Input id="class-schedule" name="schedule" placeholder="Ex : 08h-11h" maxLength={100} required aria-invalid={Boolean(fieldErrors.schedule)} />
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
            <Label htmlFor="class-tuition-fee">
              Frais de scolarité (FCFA)
            </Label>
            <Input
              id="class-tuition-fee"
              name="tuitionFee"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder="Optionnel — prix du cours sinon"
              aria-invalid={Boolean(fieldErrors.tuitionFee)}
            />
            <FieldError message={fieldErrors.tuitionFee} />
            <p className="text-xs text-muted-foreground">
              Si laissé vide, le prix configuré sur le cours porteur sera
              appliqué automatiquement aux étudiants de cette classe.
            </p>
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
              <Button type="button" variant="outline" disabled={pending} onClick={() => setSchedules([])}>
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