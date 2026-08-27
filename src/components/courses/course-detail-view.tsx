"use client";

import * as React from "react";
import Link from "next/link";
import { useActionState } from "react";
import {
  ArrowLeftIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  ClockIcon,
  GraduationCapIcon,
  Loader2Icon,
  PlusIcon,
  UsersRoundIcon,
} from "lucide-react";

import {
  createCourseLogAction,
  type CourseDetailDTO,
  type CourseLogFormState,
} from "@/actions/attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const INITIAL_FORM_STATE: CourseLogFormState = { status: "idle" };

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart d'hydratation.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

/**
 * Formulaire d'ajout d'une entrée au cahier de texte.
 * Isolé par clé React (`key={formKey}`) pour réinitialiser les champs
 * après chaque soumission réussie.
 */
function CourseLogForm({
  courseId,
  onSuccess,
}: {
  courseId: string;
  onSuccess: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prevState: CourseLogFormState, formData: FormData) => {
      const result = await createCourseLogAction(_prevState, formData);

      if (result.status === "success") {
        onSuccess();
      }

      return result;
    },
    INITIAL_FORM_STATE
  );

  const fieldErrors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="courseId" value={courseId} />

      {state.message && state.status === "success" ? (
        <p
          role="status"
          className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
        >
          <CheckCircle2Icon className="size-4 shrink-0" />
          {state.message}
        </p>
      ) : null}

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
          <Label htmlFor="log-date">Date du cours *</Label>
          <Input
            id="log-date"
            name="date"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            aria-invalid={Boolean(fieldErrors.date)}
          />
          <FieldError message={fieldErrors.date} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="log-chapterTitle">Titre du chapitre *</Label>
          <Input
            id="log-chapterTitle"
            name="chapterTitle"
            placeholder="Ex : Chapitre 4 — Le subjonctif"
            required
            aria-invalid={Boolean(fieldErrors.chapterTitle)}
          />
          <FieldError message={fieldErrors.chapterTitle} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="log-content">Contenu du cours *</Label>
        <Textarea
          id="log-content"
          name="content"
          rows={4}
          placeholder="Résumé des notions abordées, activités réalisées..."
          required
          aria-invalid={Boolean(fieldErrors.content)}
        />
        <FieldError message={fieldErrors.content} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="log-homework">Devoirs à faire</Label>
        <Textarea
          id="log-homework"
          name="homework"
          rows={2}
          placeholder="Ex : Exercices pages 52-54, réviser le vocabulaire..."
          aria-invalid={Boolean(fieldErrors.homework)}
        />
        <FieldError message={fieldErrors.homework} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="log-notes">Remarques internes</Label>
        <Textarea
          id="log-notes"
          name="notes"
          rows={2}
          placeholder="Observations pédagogiques facultatives..."
          aria-invalid={Boolean(fieldErrors.notes)}
        />
        <FieldError message={fieldErrors.notes} />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
          ) : (
            <PlusIcon data-icon="inline-start" />
          )}
          {pending ? "Ajout..." : "Ajouter au cahier de texte"}
        </Button>
      </div>
    </form>
  );
}

export function CourseDetailView({ detail }: { detail: CourseDetailDTO }) {
  const { course, students, logs } = detail;

  // Incrémenté après chaque ajout réussi afin de vider le formulaire.
  const [formKey, setFormKey] = React.useState(0);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* Fil d'Ariane */}
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/dashboard/courses">
            <ArrowLeftIcon data-icon="inline-start" />
            Retour aux cours
          </Link>
        </Button>
      </div>

      {/* En-tête du cours */}
      <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm dark:border-slate-800 dark:from-card dark:to-card">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-medium tracking-wide">
            {course.code}
          </span>
          <span className="text-xs text-muted-foreground">
            {course.enrollmentCount} étudiant
            {course.enrollmentCount > 1 ? "s" : ""} inscrit
            {course.enrollmentCount > 1 ? "s" : ""}
          </span>
        </div>

        <h2 className="mt-2 text-xl font-semibold tracking-tight">
          {course.title}
        </h2>

        {course.description ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {course.description}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <GraduationCapIcon className="size-4 shrink-0" />
            {course.teacherName ?? "Enseignant non attribué"}
          </span>
          <span className="flex items-center gap-2">
            <ClockIcon className="size-4 shrink-0" />
            {course.durationWeeks} semaine{course.durationWeeks > 1 ? "s" : ""}
          </span>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/attendance">
              <ClipboardListIcon data-icon="inline-start" />
              Prendre les présences
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* Cahier de texte */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
            <div className="border-b p-4">
              <h3 className="flex items-center gap-2 font-semibold">
                <BookOpenIcon className="size-4" />
                Nouvelle entrée au cahier de texte
              </h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Consignez le chapitre traité, le contenu de la séance et les
                devoirs donnés.
              </p>
            </div>

            <div className="p-4">
              <CourseLogForm
                key={formKey}
                courseId={course.id}
                onSuccess={() => setFormKey((key) => key + 1)}
              />
            </div>
          </div>

          {/* Historique des entrées */}
          <div className="rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
            <div className="border-b p-4">
              <h3 className="font-semibold">Historique des séances</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {logs.length} entrée{logs.length > 1 ? "s" : ""} enregistrée
                {logs.length > 1 ? "s" : ""}
              </p>
            </div>

            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                  <ClipboardListIcon className="size-6 text-muted-foreground" />
                </div>
                <p className="font-medium">Cahier de texte vide</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Ajoutez votre première entrée avec le formulaire ci-dessus.
                </p>
              </div>
            ) : (
              <ol className="divide-y">
                {logs.map((log) => (
                  <li key={log.id} className="p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h4 className="font-medium">{log.chapterTitle}</h4>
                      <time
                        dateTime={new Date(log.date).toISOString()}
                        className="text-xs text-muted-foreground"
                      >
                        {dateFormatter.format(log.date)}
                      </time>
                    </div>

                    <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">
                      {log.content}
                    </p>

                    {log.homework ? (
                      <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
                        <span className="font-semibold">Devoirs : </span>
                        {log.homework}
                      </p>
                    ) : null}

                    {log.notes ? (
                      <p className="mt-2 text-xs italic text-muted-foreground">
                        Remarque : {log.notes}
                      </p>
                    ) : null}

                    <p className="mt-2 text-xs text-muted-foreground">
                      Saisi par {log.teacherName}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        {/* Liste des étudiants inscrits */}
        <aside className="rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
          <div className="border-b p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <UsersRoundIcon className="size-4" />
              Étudiants inscrits
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {students.length} étudiant{students.length > 1 ? "s" : ""}
            </p>
          </div>

          {students.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Aucun étudiant n’est encore inscrit à ce cours.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {students.map((student) => (
                <li
                  key={student.studentId}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {student.firstName} {student.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {student.studentCode}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {Math.round(student.progress * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}