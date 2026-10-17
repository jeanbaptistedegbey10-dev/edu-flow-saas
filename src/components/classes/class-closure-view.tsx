"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  BadgeCheckIcon,
  BookOpenCheckIcon,
  CheckCircle2Icon,
  CircleSlashIcon,
  GraduationCapIcon,
  Loader2Icon,
  LockIcon,
  UsersRoundIcon,
  XCircleIcon,
} from "lucide-react";

import {
  closeClassAction,
  getClassClosureReadiness,
  type ClosureDecision,
  type ClosureMissingRequirement,
  type CloseClassDataDTO,
  type ClosureStudentDTO,
} from "@/actions/class-closure";
import { archiveClassAction } from "@/actions/classes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToastNotification } from "@/components/ui/toast";
import {
  MODULE_STATUS_BADGE_CLASSES,
  MODULE_STATUS_LABELS,
} from "@/lib/module-status";
import {
  CLASS_STATUS_BADGE_CLASSES,
  CLASS_STATUS_LABELS,
  isClassOngoing,
} from "@/lib/class-status";
import type { ClassEnrollmentStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart d'hydratation.
const numberFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/** Libellés + badges des décisions de clôture. */
const DECISION_META: Record<
  ClosureDecision,
  { label: string; classes: string; icon: React.ReactNode }
> = {
  PASSED: {
    label: "Passe au niveau supérieur",
    classes: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    icon: <CheckCircle2Icon className="size-3.5" />,
  },
  FAILED: {
    label: "Redouble",
    classes: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    icon: <XCircleIcon className="size-3.5" />,
  },
  DROPPED: {
    label: "Abandonne",
    classes: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    icon: <CircleSlashIcon className="size-3.5" />,
  },
};

/** Libellés des statuts d'inscription (historique / fiche parcours). */
export const ENROLLMENT_STATUS_LABELS: Record<ClassEnrollmentStatus, string> = {
  ACTIVE: "En cours",
  PASSED: "Passé au supérieur",
  FAILED: "Redoublement",
  PROMOTED_MANUALLY: "Passage manuel",
  DROPPED: "Abandon",
  COMPLETED: "Clôturée (sans décision)",
};

/** Badge compact du récapitulatif de modules d'un étudiant. */
function ModuleBadge({ status }: { status: ClosureStudentDTO["modules"][number]["status"] }) {
  if (status === null) {
    return (
      <span className={cn(BADGE_BASE_CLASSES, "bg-muted text-muted-foreground")}>
        Non noté
      </span>
    );
  }
  return (
    <span
      className={cn(BADGE_BASE_CLASSES, MODULE_STATUS_BADGE_CLASSES[status])}
    >
      {MODULE_STATUS_LABELS[status]}
    </span>
  );
}

export function ClassClosureView({ data }: { data: CloseClassDataDTO }) {
  const router = useRouter();
  const isClosed = !isClassOngoing(data.status);

  // Décisions par étudiant (init : décision automatique proposée).
  const [decisions, setDecisions] = React.useState<Record<string, ClosureDecision>>(() =>
    Object.fromEntries(
      data.students.map((student) => [
        student.studentId,
        student.autoDecision,
      ])
    )
  );
  const [mode, setMode] = React.useState<"automatic" | "manual">("automatic");
  const [targetClassId, setTargetClassId] = React.useState<string>("");
  /**
   * Nouvelle session du MÊME niveau (même cours porteur) destinée à accueillir
   * les redoublants. Vide ⇒ les redoublants restent rattachés à la classe
   * clôturée (historique) sans nouvelle inscription.
   */
  const [repeatTargetClassId, setRepeatTargetClassId] =
    React.useState<string>("");
  const [globalNote, setGlobalNote] = React.useState("");
  const [chargeFee, setChargeFee] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const [expandedStudent, setExpandedStudent] = React.useState<string | null>(null);
  /** Prérequis de clôture non satisfaits (alerte bloquante). */
  const [missingRequirements, setMissingRequirements] =
    React.useState<ClosureMissingRequirement[]>([]);
  const [blockedOpen, setBlockedOpen] = React.useState(false);

  /** Active le mode manuel : les décisions deviennent modifiables. */
  const switchToManual = () => setMode("manual");

  /** Basculer TOUTE la promotion en automatique (réapplique la proposition). */
  const applyAutomaticDecisions = () => {
    setMode("automatic");
    setDecisions(
      Object.fromEntries(
        data.students.map((student) => [student.studentId, student.autoDecision])
      )
    );
  };

  const hasStudents = data.students.length > 0;

  // Compteurs derives des decisions.
  const promotedCount = data.students.filter(
    (student) => decisions[student.studentId] === "PASSED"
  ).length;
  const retainedCount = data.students.filter(
    (student) => decisions[student.studentId] === "FAILED"
  ).length;
  const droppedCount = data.students.filter(
    (student) => decisions[student.studentId] === "DROPPED"
  ).length;

  /** Bulk : passer / faire redoubler tous les etudiants (mode manuel). */
  const bulkDecision = (decision: ClosureDecision) => {
    switchToManual();
    setDecisions(
      Object.fromEntries(
        data.students.map((student) => [student.studentId, decision])
      )
    );
  };

  /**
   * Vérifie les prérequis de clôture AVANT toute exécution.
   *
   * Le serveur (`closeClassAction`) réapplique le même contrôle — cette
   * vérification côté client sert à afficher une alerte claire AVANT de
   * parcourir le formulaire, et à éviter une erreur opaque.
   */
  const assertReadiness = async (): Promise<boolean> => {
    const readiness = await getClassClosureReadiness(data.id);

    if (!readiness.ok) {
      setToast(readiness.message);
      return false;
    }

    if (!readiness.canClose) {
      setMissingRequirements(readiness.missingRequirements);
      setBlockedOpen(true);
      return false;
    }

    return true;
  };

  /**
   * Exécute la clôture : marque les décisions, crée les dossiers de la classe
   * cible SANS frais par défaut, et clôture la classe (COMPLETED).
   */
  const handleClose = async () => {
    if (submitting) return;

    setSubmitting(true);
    try {
      if (!(await assertReadiness())) return;

      const result = await closeClassAction({
        classId: data.id,
        targetClassId: targetClassId || null,
        repeatTargetClassId: repeatTargetClassId || null,
        chargeReRegistrationFee: chargeFee,
        globalDecisionNote: globalNote.trim() || undefined,
        decisions: data.students.map((student) => ({
          studentId: student.studentId,
          decision: decisions[student.studentId] ?? student.autoDecision,
        })),
      });

      if (result.ok) {
        setToast(
          `Classe clôturée : ${result.promoted} promu(s), ${result.retained} redoublant(s), ${result.dropped} abandon(s), ${result.certificatesGenerated} certificat(s) généré(s).`
        );
        // Retour à la liste : la classe étant désormais clôturée, elle n'est
        // plus proposée dans le sélecteur de la vue unifiée.
        router.push("/dashboard/classes");
      } else {
        setToast(result.message);
      }
    } catch {
      setToast("Erreur réseau : impossible de clôturer la classe pour le moment.");
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  /** Clôture + archivage direct : clôture puis passe en ARCHIVED. */
  const handleCloseAndArchive = async () => {
    if (submitting || archiving) return;
    setArchiving(true);
    try {
      if (!(await assertReadiness())) return;

      const result = await closeClassAction({
        classId: data.id,
        targetClassId: targetClassId || null,
        repeatTargetClassId: repeatTargetClassId || null,
        chargeReRegistrationFee: chargeFee,
        globalDecisionNote: globalNote.trim() || undefined,
        decisions: data.students.map((student) => ({
          studentId: student.studentId,
          decision: decisions[student.studentId] ?? student.autoDecision,
        })),
      });
      if (!result.ok) {
        setToast(result.message);
        return;
      }
      const archived = await archiveClassAction(data.id);
      if (archived.ok) {
        setToast(
          `Classe clôturée et archivée : ${result.promoted} promu(s), ${result.certificatesGenerated} certificat(s) généré(s).`
        );
        router.push("/dashboard/classes");
      } else {
        setToast(`Classe clôturée (${result.certificatesGenerated} certificat(s)), mais archivage impossible : ${archived.message ?? ""}`);
        router.push("/dashboard/classes");
      }
    } catch {
      setToast("Erreur réseau : impossible de clôturer et archiver la classe.");
    } finally {
      setArchiving(false);
      setConfirmOpen(false);
    }
  };

  const statusBadge = {
    label: CLASS_STATUS_LABELS[data.status],
    classes: CLASS_STATUS_BADGE_CLASSES[data.status],
  };

  /**
   * Nouvelles sessions du même niveau éligibles au redoublement : classes en
   * cours portant LE MÊME cours que la classe clôturée (ex : « A1 - Soir »
   * pour une « A1 - Matin » clôturée).
   */
  const repeatTargetClasses = data.targetClasses.filter(
    (target) => target.courseId === data.courseId
  );

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* En-tête de page */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/attendance?classId=${data.id}`}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background p-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Retour à la vue Présences & Cahier de texte"
          >
            <ArrowLeftIcon className="size-4" />
          </Link>
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              Clôture de la classe
              <span className={cn(BADGE_BASE_CLASSES, statusBadge.classes)}>
                {statusBadge.label}
              </span>
            </h2>
            <p className="text-base text-muted-foreground">
              {data.name} — {data.courseTitle} ({data.courseCode})
            </p>
          </div>
        </div>
      </div>

      {isClosed ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <LockIcon className="size-6 text-muted-foreground" />
          </div>
          <p className="font-medium">
            Cette classe est déjà clôturée (statut « {statusBadge.label} »).
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            Les décisions de passage sont verrouillées. Consultez le parcours et
            l&apos;historique de chaque étudiant depuis sa fiche.
          </p>
          <Link href="/dashboard/classes">
            <Button variant="outline">Retour à la liste des classes</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Réglages de la clôture */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <UsersRoundIcon className="size-4" />
                <span className="text-sm">Effectif à clôturer</span>
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {data.students.length}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {data.students.filter((s) => s.summary.eligibleForPromotion).length}{" "}
                étudiant(s) éligible(s) au passage automatique
              </p>
            </div>

            {/* Classe cible + modes */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm lg:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="closure-target-class">
                    Classe de destination (passage) — optionnel
                  </Label>
                  {data.targetClasses.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Aucune autre classe active n&apos;est disponible. Les
                      étudiants admis seront simplement marqués « admis » sans
                      être transférés (certificats générés quand même).
                    </p>
                  ) : (
                    <Select value={targetClassId} onValueChange={setTargetClassId}>
                      <SelectTrigger id="closure-target-class" className="w-full">
                        <SelectValue placeholder="Aucune — marquer les admis sans transfert" />
                      </SelectTrigger>
                      <SelectContent>
                        {data.targetClasses.map((target) => (
                          <SelectItem key={target.id} value={target.id}>
                            {target.name} — {target.courseTitle} ({target.courseCode})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Redoublants : affectation à une nouvelle session du MÊME niveau */}
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="closure-repeat-target-class">
                    Nouvelle session pour les redoublants (même niveau)
                  </Label>
                  {repeatTargetClasses.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Aucune autre session de ce niveau n&apos;est ouverte. Les
                      redoublants resteront rattachés à cette classe (historique) :
                      créez puis démarrez une nouvelle session du même cours pour
                      les y affecter automatiquement.
                    </p>
                  ) : (
                    <>
                      <Select
                        value={repeatTargetClassId}
                        onValueChange={setRepeatTargetClassId}
                      >
                        <SelectTrigger
                          id="closure-repeat-target-class"
                          className="w-full"
                        >
                          <SelectValue placeholder="Aucune réaffectation automatique" />
                        </SelectTrigger>
                        <SelectContent>
                          {repeatTargetClasses.map((target) => (
                            <SelectItem key={target.id} value={target.id}>
                              {target.name} — {target.schedule}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {retainedCount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {repeatTargetClassId
                            ? `${retainedCount} redoublant(s) seront inscrits dans la session sélectionnée.`
                            : "Sélectionnez une session pour réinscrire automatiquement les redoublants."}
                        </p>
                      )}
                    </>
                  )}
                </div>

                <div className="grid gap-1.5">
                  <Label>Mode de décision</Label>
                  <div className="flex gap-1 rounded-lg border p-1">
                    <button
                      type="button"
                      onClick={applyAutomaticDecisions}
                      className={cn(
                        "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        mode === "automatic"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent"
                      )}
                    >
                      Automatique
                    </button>
                    <button
                      type="button"
                      onClick={switchToManual}
                      className={cn(
                        "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                        mode === "manual"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent"
                      )}
                    >
                      Manuel
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {mode === "automatic"
                      ? "Passage proposé si tous les modules requis sont validés (≥ seuil)."
                      : "Vous décidez librement qui passe, redouble ou abandonne."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Gestion financière : frais de réinscription OPTIONNELS */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <BookOpenCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    Facturer les frais de réinscription
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Désactivé par défaut : une promotion interne (ex : A1 → A2)
                    ne génère <strong>aucun frais</strong> et n&apos;impacte pas
                    la comptabilité de l&apos;élève. Activez uniquement si
                    l&apos;école réimpose des frais.
                  </p>
                </div>
              </div>
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={chargeFee}
                  onChange={(event) => setChargeFee(event.target.checked)}
                  className="size-4 accent-primary"
                  aria-label="Facturer les frais de réinscription"
                />
                {chargeFee
                  ? `${numberFormatter.format(data.defaultRegistrationFee)} FCFA par étudiant promu`
                  : "Aucun frais"}
              </label>
            </div>
          </div>

          {/* Liste des étudiants : récapitulatif modules + décisions */}
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
              <div>
                <h3 className="flex items-center gap-2 font-semibold">
                  <GraduationCapIcon className="size-4" />
                  Étudiants & décision de passage
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Récapitulatif des modules validés / non validés par étudiant.
                </p>
              </div>
              {mode === "manual" && hasStudents && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => bulkDecision("PASSED")}
                  >
                    <BadgeCheckIcon data-icon="inline-start" />
                    Tous passent
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => bulkDecision("FAILED")}
                  >
                    Tous redoublent
                  </Button>
                </div>
              )}
            </div>

            {!hasStudents ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  Aucun étudiant actif n&apos;est inscrit dans cette classe.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {data.students.map((student) => {
                  const decision =
                    decisions[student.studentId] ?? student.autoDecision;
                  const meta = DECISION_META[decision];
                  const isExpanded = expandedStudent === student.studentId;

                  return (
                    <li key={student.studentId} className="px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-col">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedStudent(isExpanded ? null : student.studentId)
                            }
                            className="flex items-center gap-2 text-left text-sm font-medium hover:underline"
                            aria-expanded={isExpanded}
                          >
                            {student.firstName} {student.lastName}
                            <span className="text-xs text-muted-foreground">
                              {student.studentCode}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              — {student.summary.validated}/{student.summary.graded}{" "}
                              module(s) validé(s)
                              {student.summary.ungraded > 0
                                ? `, ${student.summary.ungraded} non noté(s)`
                                : ""}
                            </span>
                          </button>

                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                BADGE_BASE_CLASSES,
                                student.autoDecision === "PASSED"
                                  ? DECISION_META.PASSED.classes
                                  : DECISION_META.FAILED.classes
                              )}
                            >
                              {student.autoDecision === "PASSED"
                                ? DECISION_META.PASSED.icon
                                : DECISION_META.FAILED.icon}
                              <span className="ml-1">
                                {student.autoDecision === "PASSED"
                                  ? "Système : passage conseillé"
                                  : "Système : redoublement conseillé"}
                              </span>
                            </span>
                            <span className={cn(BADGE_BASE_CLASSES, meta.classes)}>
                              {meta.icon}
                              <span className="ml-1">{meta.label}</span>
                            </span>
                          </div>
                        </div>

                        {/* Décision : modifiable uniquement en mode manuel */}
                        <Select
                          value={decision}
                          disabled={mode === "automatic"}
                          onValueChange={(value) => {
                            switchToManual();
                            setDecisions((prev) => ({
                              ...prev,
                              [student.studentId]: value as ClosureDecision,
                            }));
                          }}
                        >
                          <SelectTrigger className="w-56">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PASSED">
                              Passe au niveau supérieur
                            </SelectItem>
                            <SelectItem value="FAILED">Redouble</SelectItem>
                            <SelectItem value="DROPPED">Abandonne</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Détail des modules de l'étudiant */}
                      {isExpanded && (
                        <div className="mt-3 overflow-x-auto rounded-lg border bg-muted/30 p-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-muted-foreground">
                                <th className="py-1 pr-3 font-medium">Évaluation</th>
                                <th className="py-1 pr-3 font-medium">Module</th>
                                <th className="py-1 pr-3 text-right font-medium">
                                  Note
                                </th>
                                <th className="py-1 pr-3 text-right font-medium">
                                  Seuil
                                </th>
                                <th className="py-1 font-medium">Statut</th>
                              </tr>
                            </thead>
                            <tbody>
                              {student.modules.map((module) => (
                                <tr
                                  key={`${student.studentId}:${module.evaluationTitle}:${module.moduleName}`}
                                  className="border-t"
                                >
                                  <td className="py-1.5 pr-3 text-muted-foreground">
                                    {module.evaluationTitle}
                                  </td>
                                  <td className="py-1.5 pr-3 font-medium">
                                    {module.moduleName}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums">
                                    {module.score === null
                                      ? "—"
                                      : `${numberFormatter.format(module.score)} / ${numberFormatter.format(module.maxScore)}`}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                                    {numberFormatter.format(module.passMark)}
                                  </td>
                                  <td className="py-1.5">
                                    <ModuleBadge status={module.status} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>


          {/* Appréciation globale + bouton de clôture */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="closure-global-note">
                  Appréciation globale de décision (optionnelle)
                </Label>
                <Textarea
                  id="closure-global-note"
                  value={globalNote}
                  onChange={(event) => setGlobalNote(event.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="Ex : Session clôturée, bons résultats d'ensemble."
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {promotedCount} passage(s) · {retainedCount} redoublement(s) ·{" "}
                  {droppedCount} abandon(s)
                  {chargeFee && promotedCount > 0
                    ? ` · ${numberFormatter.format(data.defaultRegistrationFee * promotedCount)} FCFA de frais de réinscription facturés`
                    : " · aucun frais généré"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={!hasStudents || submitting || archiving}
                  onClick={() => setConfirmOpen(true)}
                >
                  <AlertTriangleIcon data-icon="inline-start" />
                  Terminer la classe
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!hasStudents || submitting || archiving}
                  onClick={() => void handleCloseAndArchive()}
                >
                  {archiving ? (
                    <Loader2Icon data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <LockIcon data-icon="inline-start" />
                  )}
                  {archiving ? "Archivage…" : "Clôturer et Archiver la classe"}
                </Button>
                </div>
              </div>
              {!targetClassId && hasStudents && (
                <p className="text-xs text-muted-foreground">
                  Aucune classe de destination sélectionnée : les étudiants avec
                  la décision « Passe au niveau supérieur » seront marqués
                  admis/terminé sans transfert, et leur certificat sera généré.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Garde-fou : prérequis de clôture non réunis — la liste des éléments
          manquants est affichée explicitement avant toute confirmation. */}
      <AlertDialog open={blockedOpen} onOpenChange={setBlockedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="size-5 text-amber-600" />
              Clôture impossible — prérequis manquants
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  La classe « {data.name} » ne peut pas être clôturée tant que
                  les éléments suivants ne sont pas complétés :
                </p>
                <ul className="list-disc space-y-1.5 pl-5">
                  {missingRequirements.map((requirement) => (
                    <li key={requirement.key}>{requirement.label}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>
              <CheckCircle2Icon data-icon="inline-start" />
              J&apos;ai compris
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation de la clôture (action irréversible) */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la fin de la classe ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  La classe « {data.name} » passera au statut{" "}
                  <strong>Clôturée (COMPLETED)</strong> : les décisions deviennent
                  définitives et verrouillées, les bulletins sont finalisés et les
                  certificats des admis générés automatiquement.
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    {targetClassId ? (
                      <>
                        {promotedCount} étudiant(s) transféré(s) vers la classe
                        sélectionnée — <strong>aucun frais d&apos;inscription</strong>{" "}
                        généré{chargeFee ? ", sauf frais de réinscription cochés" : ""}.
                      </>
                    ) : (
                      <>
                        {promotedCount} étudiant(s) marqué(s) « admis » sans
                        transfert vers une nouvelle classe —{" "}
                        <strong>aucun frais d&apos;inscription</strong> généré
                        {chargeFee ? ", sauf frais de réinscription cochés" : ""}.
                      </>
                    )}
                    {promotedCount > 0 ? (
                      <> {promotedCount} certificat(s) seront émis.</>
                    ) : null}
                  </li>
                  <li>
                    {retainedCount} redoublant(s) — modules échoués marqués « À
                    reprendre »
                    {repeatTargetClassId
                      ? " et réinscrits dans la nouvelle session du même niveau sélectionnée."
                      : " (aucune nouvelle session sélectionnée : ils restent rattachés à cette classe)."}
                  </li>
                  <li>{droppedCount} abandon(s) enregistré(s).</li>
                </ul>
                <p className="text-xs text-muted-foreground">
                  Les bulletins et rapports de présence de cette classe restent
                  consultables sur la fiche de chaque étudiant (onglet « Parcours
                  &amp; Historique »).
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(event) => {
                event.preventDefault();
                void handleClose();
              }}
            >
              {submitting ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : (
                <CheckCircle2Icon data-icon="inline-start" />
              )}
              {submitting ? "Clôture en cours…" : "Confirmer la clôture"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ToastNotification message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

