"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  ClockIcon,
  Loader2Icon,
  PencilIcon,
  SaveIcon,
  UsersRoundIcon,
} from "lucide-react";

import {
  upsertCourseLogAction,
  type CourseDetailDTO,
  type CourseLogDTO,
} from "@/actions/attendance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart d'hydratation.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Date du jour au format « YYYY-MM-DD » (UTC). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Cherche une entrée du cahier de texte pour une date donnée dans la liste
 * des logs. Retourne `undefined` si aucune entrée n'existe pour cette date.
 */
function findLogForDate(
  logs: CourseLogDTO[],
  dateIso: string
): CourseLogDTO | undefined {
  return logs.find((log) => {
    const logDateIso = new Date(log.date).toISOString().slice(0, 10);
    return logDateIso === dateIso;
  });
}

/**
 * Formulaire du cahier de texte avec auto-remplissage :
 * - Au chargement ou lors d'un changement de date, si une entrée existe déjà
 *   pour le cours à cette date, le formulaire est pré-rempli avec ses valeurs.
 * - Le bouton affiche « Mettre à jour » si l'entrée existe, « Ajouter » sinon.
 * - L'action upsert garantit l'unicité par [courseId, date].
 */
function CourseLogForm({
  courseId,
  logs,
  onSuccess,
}: {
  courseId: string;
  logs: CourseLogDTO[];
  onSuccess: (savedLog: CourseLogDTO) => void;
}) {
  const [date, setDate] = React.useState<string>(todayIso());
  const [chapterTitle, setChapterTitle] = React.useState("");
  const [content, setContent] = React.useState("");
  const [homework, setHomework] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  // Détermine si une entrée existe déjà pour la date sélectionnée.
  const existingLog = React.useMemo(
    () => findLogForDate(logs, date),
    [logs, date]
  );
  const isEditing = Boolean(existingLog);

  // Auto-remplissage du formulaire lorsque la date change et qu'une entrée
  // existe pour cette date dans l'historique. Ne touche pas au `feedback`
  // (sinon le message de succès post-save serait effacé par la fusion
  // optimiste de l'historique qui déclenche ce même effet via `logs`).
  React.useEffect(() => {
    const log = findLogForDate(logs, date);
    if (log) {
      setChapterTitle(log.chapterTitle);
      setContent(log.content);
      setHomework(log.homework ?? "");
      setNotes(log.notes ?? "");
    } else {
      setChapterTitle("");
      setContent("");
      setHomework("");
      setNotes("");
    }
  }, [date, logs]);

  // Efface le feedback uniquement lors d'un changement de date saisie.
  React.useEffect(() => {
    setFeedback(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chapterTitle.trim() || !content.trim()) return;

    setPending(true);
    setFeedback(null);

    try {
      const result = await upsertCourseLogAction({
        courseId,
        date,
        chapterTitle,
        content,
        homework,
        notes,
      });

      if (result.ok) {
        setFeedback({
          kind: "success",
          message: isEditing
            ? "Entrée mise à jour dans le cahier de texte."
            : "Entrée ajoutée au cahier de texte.",
        });
        // Remonte le log persisté : le parent fusionne l'historique local
        // puis déclenche `router.refresh()` (revalidation serveur).
        onSuccess(result.log);
      } else {
        setFeedback({ kind: "error", message: result.message });
      }
    } catch {
      setFeedback({
        kind: "error",
        message: "Une erreur est survenue lors de l'enregistrement.",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold">
          <ClipboardListIcon className="size-4" />
          Cahier de texte
        </h3>
        {isEditing ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
            <PencilIcon className="size-3" />
            Mode édition
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200/60 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400">
            <BookOpenIcon className="size-3" />
            Nouvelle entrée
          </span>
        )}
      </div>

      {feedback ? (
        <p
          role={feedback.kind === "success" ? "status" : "alert"}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm",
            feedback.kind === "success"
              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive"
          )}
        >
          {feedback.kind === "success" && (
            <CheckCircle2Icon className="size-4 shrink-0" />
          )}
          {feedback.message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="log-date">Date du cours *</Label>
          <Input
            id="log-date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value || todayIso())}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="log-chapterTitle">Titre du chapitre *</Label>
          <Input
            id="log-chapterTitle"
            value={chapterTitle}
            onChange={(e) => setChapterTitle(e.target.value)}
            placeholder="Ex : Chapitre 4 — Le subjonctif"
            required
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="log-content">Contenu du cours *</Label>
        <Textarea
          id="log-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Déroulé de la séance, notions abordées..."
          rows={4}
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="log-homework">Devoirs donnés</Label>
          <Textarea
            id="log-homework"
            value={homework}
            onChange={(e) => setHomework(e.target.value)}
            placeholder="Exercices, lectures..."
            rows={2}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="log-notes">Remarques</Label>
          <Textarea
            id="log-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observations diverses..."
            rows={2}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-muted-foreground">
          {isEditing
            ? "Entrée existante — modifiez les champs puis enregistrez les modifications."
            : "Nouvelle entrée — remplissez les champs puis enregistrez."}
        </p>
        <Button
          type="submit"
          disabled={pending || !chapterTitle.trim() || !content.trim()}
        >
          {pending ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
          ) : isEditing ? (
            <SaveIcon data-icon="inline-start" />
          ) : (
            <BookOpenIcon data-icon="inline-start" />
          )}
          {pending
            ? "Enregistrement..."
            : isEditing
            ? "Mettre à jour l'entrée"
            : "Ajouter au cahier de texte"}
        </Button>
      </div>
    </form>
  );
}

export function CourseDetailView({ detail }: { detail: CourseDetailDTO }) {
  const router = useRouter();
  const { course, students, logs: initialLogs } = detail;

  // Historique local synchronisé : `detail.logs` est un snapshot serveur figé
  // à l'instant du rendu. Après un upsert, `revalidatePath` invalide le cache
  // serveur mais ne réinjecte pas les props tant que `router.refresh()` n'est
  // pas appelé — d'où la fusion optimiste immédiate (aucun rechargement
  // manuel requis) puis la réconciliation serveur.
  const [logs, setLogs] = React.useState<CourseLogDTO[]>(initialLogs);

  // Resynchronise si le serveur pousse de nouvelles props (navigation,
  // `router.refresh()` après revalidation).
  React.useEffect(() => {
    setLogs(initialLogs);
  }, [initialLogs]);

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
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
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

      {/* Cahier de texte */}
      <Tabs defaultValue="cahier" className="flex flex-col gap-4">
        <TabsList className="w-fit">
          <TabsTrigger value="cahier">
            <BookOpenIcon className="size-4" />
            Cahier de texte
          </TabsTrigger>
        </TabsList>

        {/* Onglet Cahier de texte */}
        <TabsContent value="cahier">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-border bg-card shadow-sm">
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
                    courseId={course.id}
                    logs={logs}
                    onSuccess={(savedLog) => {
                      // 1) Mise à jour optimiste unique : upsert par [courseId, date]
                      //    (même clé que la contrainte serveur) — aucun doublon.
                      setLogs((prev) => {
                        const savedDay = new Date(savedLog.date)
                          .toISOString()
                          .slice(0, 10);
                        const next = prev.some(
                          (l) =>
                            new Date(l.date).toISOString().slice(0, 10) ===
                            savedDay
                        )
                          ? prev.map((l) =>
                              new Date(l.date).toISOString().slice(0, 10) ===
                              savedDay
                                ? savedLog
                                : l
                            )
                          : [savedLog, ...prev];
                        // Tri décroissant (plus récent d'abord), cohérent serveur.
                        return [...next].sort(
                          (a, b) =>
                            new Date(b.date).getTime() -
                            new Date(a.date).getTime()
                        );
                      });
                      // 2) Réconciliation serveur : la Server Action a déjà fait
                      //    `revalidatePath`, `router.refresh()` réinjecte les props.
                      router.refresh();
                    }}
                  />
                </div>
              </div>

              {/* Historique des entrées */}
              <div className="rounded-xl border border-border bg-card shadow-sm">
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
        <aside className="rounded-xl border border-border bg-card shadow-sm">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

