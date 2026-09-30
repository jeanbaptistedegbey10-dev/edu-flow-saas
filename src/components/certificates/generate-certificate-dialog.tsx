"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";

import type { ClassStatus } from "@prisma/client";

import type { ClassDTO } from "@/actions/classes";
import type { StudentDTO } from "@/actions/students";
import {
  generateCertificate,
  type CertificateDTO,
  type CertificateEnrollmentLinkDTO,
} from "@/lib/actions/certificates";
import { Button } from "@/components/ui/button";
import {
  Dialog,
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
import { ToastNotification } from "@/components/ui/toast";

/** Classes « terminées » éligibles à la génération manuelle de certificats. */
const CLOSED_CLASS_STATUSES: readonly ClassStatus[] = ["COMPLETED", "ARCHIVED"];

/**
 * Attribution manuelle d'un certificat : l'étudiant doit être inscrit dans une
 * classe terminée (clôturée / archivée) et ne pas déjà posséder de certificat
 * pour le parcours porteur — mêmes règles que la génération automatique de la
 * clôture. Le niveau est pré-rempli avec l'intitulé du cours porteur.
 */
export function GenerateCertificateDialog({
  classes,
  students,
  enrollmentLinks,
  certificates,
  open,
  onOpenChange,
  onGenerated,
}: {
  classes: ClassDTO[];
  students: StudentDTO[];
  enrollmentLinks: CertificateEnrollmentLinkDTO[];
  certificates: CertificateDTO[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated?: () => void;
}) {
  const [selectedClassId, setSelectedClassId] = React.useState("");
  const [selectedStudentId, setSelectedStudentId] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [score, setScore] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const completedClasses = React.useMemo(
    () => classes.filter((klass) => CLOSED_CLASS_STATUSES.includes(klass.status)),
    [classes]
  );

  const selectedClass =
    completedClasses.find((klass) => klass.id === selectedClassId) ?? null;

  /** Étudiants déjà certifiés, regroupés par cours porteur. */
  const certifiedStudentIdsByCourse = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const cert of certificates) {
      if (!cert.courseId) continue;
      const ids = map.get(cert.courseId);
      if (ids) {
        ids.add(cert.studentId);
      } else {
        map.set(cert.courseId, new Set([cert.studentId]));
      }
    }
    return map;
  }, [certificates]);

  /**
   * Étudiants éligibles de la classe sélectionnée : inscrits dans la classe
   * (via l'historique des affectations) et sans certificat pour ce parcours.
   */
  const eligibleStudents = React.useMemo(() => {
    if (!selectedClass) return [];
    const enrolledIds = new Set(
      enrollmentLinks
        .filter((link) => link.classId === selectedClass.id)
        .map((link) => link.studentId)
    );
    const certifiedIds =
      certifiedStudentIdsByCourse.get(selectedClass.courseId) ??
      new Set<string>();
    return students.filter(
      (student) => enrolledIds.has(student.id) && !certifiedIds.has(student.id)
    );
  }, [selectedClass, enrollmentLinks, students, certifiedStudentIdsByCourse]);

  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    setSelectedStudentId("");
    // Niveau pré-rempli avec le parcours porteur (comme en génération auto).
    const klass = completedClasses.find((item) => item.id === classId);
    setLevel(klass ? klass.courseTitle : "");
  };

  const handleClose = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setSelectedClassId("");
      setSelectedStudentId("");
      setLevel("");
      setScore("");
    }
  };

  const handleSubmit = async () => {
    if (!selectedClass || !selectedStudentId || !level.trim()) {
      setToast("Veuillez remplir tous les champs requis.");
      return;
    }
    setPending(true);
    const scoreValue = score ? Number(score) : undefined;
    const result = await generateCertificate(
      selectedStudentId,
      selectedClass.courseId,
      level,
      scoreValue
    );
    setPending(false);
    if (result.ok) {
      setToast("Certificat généré avec succès !");
      handleClose(false);
      onGenerated?.();
    } else {
      setToast(result.message);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Générer un certificat</DialogTitle>
            <DialogDescription>
              Attribuez manuellement un certificat sécurisé (QR Code) à un
              étudiant éligible d&apos;une classe terminée.
            </DialogDescription>
          </DialogHeader>

          {completedClasses.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-8 text-center">
              <p className="text-sm font-medium">Aucune classe terminée</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Clôturez une classe depuis son espace dédié pour pouvoir
                délivrer des certificats de fin de niveau.
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="certificate-class">Classe terminée</Label>
                <Select value={selectedClassId} onValueChange={handleClassChange}>
                  <SelectTrigger id="certificate-class">
                    <SelectValue placeholder="Choisir une classe terminée…" />
                  </SelectTrigger>
                  <SelectContent>
                    {completedClasses.map((klass) => (
                      <SelectItem key={klass.id} value={klass.id}>
                        {klass.name} — {klass.courseTitle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="certificate-student">Étudiant éligible</Label>
                  {selectedClass && (
                    <span className="text-xs text-muted-foreground">
                      {eligibleStudents.length} éligible(s)
                    </span>
                  )}
                </div>
                {selectedClass && eligibleStudents.length === 0 ? (
                  <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Tous les étudiants de cette classe disposent déjà
                    d&apos;un certificat pour ce parcours.
                  </p>
                ) : (
                  <Select
                    value={selectedStudentId}
                    onValueChange={setSelectedStudentId}
                    disabled={!selectedClass}
                  >
                    <SelectTrigger id="certificate-student">
                      <SelectValue
                        placeholder={
                          selectedClass
                            ? "Choisir un étudiant…"
                            : "Choisissez d'abord une classe…"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleStudents.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.firstName} {student.lastName} ·{" "}
                          {student.studentCode}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="level">Niveau validé</Label>
                <Input
                  id="level"
                  placeholder="Ex : Allemand A1 - CECRL"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="score">Note (optionnel, 0-100)</Label>
                <Input
                  id="score"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="Ex : 85"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                !selectedClass || !selectedStudentId || !level.trim() || pending
              }
            >
              {pending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
              Générer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ToastNotification message={toast} onClose={() => setToast(null)} />
    </>
  );
}
