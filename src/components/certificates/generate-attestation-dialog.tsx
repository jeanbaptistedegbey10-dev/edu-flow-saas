"use client";

import * as React from "react";
import { Loader2Icon, PrinterIcon } from "lucide-react";

import type { ClassStatus } from "@prisma/client";

import type { ClassDTO } from "@/actions/classes";
import type { StudentDTO } from "@/actions/students";
import { getCurrentOrganizationProfile } from "@/actions/payments";
import type { OrganizationProfileDTO } from "@/actions/payments";
import type { CertificateEnrollmentLinkDTO } from "@/lib/actions/certificates";
import { SELECTABLE_CLASS_STATUSES } from "@/lib/class-status";
import {
  buildDefaultAttestationMessage,
  buildInternalAttestationDocument,
  EMPTY_ATTESTATION_FIELDS,
  toAttestationDateInputValue,
  type AttestationFieldValues,
  type InternalAttestationInput,
} from "@/lib/report-card";
import { printHtmlDocument } from "@/lib/receipt";
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
import { Textarea } from "@/components/ui/textarea";

/**
 * Génération d'une ATTESTATION DE FORMATION EN COURS (différente du
 * certificat officiel de fin de niveau).
 *
 * - Sélection d'une classe ACTIVE (statuts PLANIFIED / ACTIVE / IN_PROGRESS —
 *   voir `SELECTABLE_CLASS_STATUSES`) : seuls les étudiants inscrits dans une
 *   classe encore en exploitation peuvent en bénéficier ;
 * - Sélection d'un étudiant inscrit dans cette classe active ;
 * - Édition libre du paragraphe de l'attestation (niveau B1/B2, délai avant
 *   examen…), pré-rempli avec la formulation officielle de l'établissement ;
 * - Aperçu fidèle (iframe) puis impression / enregistrement PDF via la boîte
 *   de dialogue système (`printHtmlDocument`).
 *
 * Réutilise le moteur d'attestation interne existant (`@/lib/report-card`) afin
 * de rester strictement aligné sur le rendu déjà validé côté étudiant.
 */
export function GenerateAttestationDialog({
  classes,
  students,
  enrollmentLinks,
  open,
  onOpenChange,
}: {
  classes: ClassDTO[];
  students: StudentDTO[];
  /** Historique des affectations étudiant ↔ classe. */
  enrollmentLinks: CertificateEnrollmentLinkDTO[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedClassId, setSelectedClassId] = React.useState("");
  const [selectedStudentId, setSelectedStudentId] = React.useState("");
  const [organization, setOrganization] =
    React.useState<OrganizationProfileDTO | null>(null);
  const [pending, setPending] = React.useState(false);

  // Classes actives éligibles (le cycle de vie est porté par le domaine :
  // `SELECTABLE_CLASS_STATUSES` = PLANIFIED | ACTIVE | IN_PROGRESS).
  const activeClasses = React.useMemo(
    () =>
      classes.filter((klass) =>
        (SELECTABLE_CLASS_STATUSES as readonly ClassStatus[]).includes(
          klass.status
        )
      ),
    [classes]
  );

  const selectedClass =
    activeClasses.find((klass) => klass.id === selectedClassId) ?? null;

  const selectedStudent =
    students.find((student) => student.id === selectedStudentId) ?? null;

  /** Étudiants inscrits dans la classe active sélectionnée. */
  const enrolledStudents = React.useMemo(() => {
    if (!selectedClass) return [];
    const enrolledIds = new Set(
      enrollmentLinks
        .filter((link) => link.classId === selectedClass.id)
        .map((link) => link.studentId)
    );
    return students.filter((student) => enrolledIds.has(student.id));
  }, [selectedClass, enrollmentLinks, students]);

  // Champs d'information de l'attestation (naissance, résidence, calendrier
  // du cursus) : pré-remplis depuis la fiche étudiant puis éditables avant
  // impression — la base ne connaît ni la fin prévue ni la date d'examen.
  const [fields, setFields] = React.useState<AttestationFieldValues>(
    EMPTY_ATTESTATION_FIELDS
  );

  // Paragraphe éditable : brouillon saisi par l'utilisateur (`null` tant qu'il
  // n'a rien modifié), sinon formulation officielle par défaut à variables.
  const defaultMessage = React.useMemo(
    () => buildDefaultAttestationMessage(),
    []
  );
  const [messageDraft, setMessageDraft] = React.useState<string | null>(null);
  const message = messageDraft ?? defaultMessage;

  // Données structurées de l'attestation (aperçu + impression) : identité de
  // l'étudiant + champs éditorisables + paragraphe.
  const attestationInput: InternalAttestationInput | null = React.useMemo(
    () =>
      selectedStudent
        ? {
            studentName: `${selectedStudent.firstName} ${selectedStudent.lastName}`,
            studentCode: selectedStudent.studentCode,
            className: selectedClass?.name ?? null,
            courseTitle: selectedClass?.courseTitle ?? null,
            overallAverage: null,
            validationRate: null,
            customMessage: message,
            birthDate: fields.birthDate || null,
            city: fields.city.trim() || null,
            startDate: fields.startDate || null,
            expectedEndDate: fields.expectedEndDate || null,
            examDate: fields.examDate || null,
          }
        : null,
    [selectedStudent, selectedClass, message, fields]
  );

  // Chargement paresseux du profil organisation à l'ouverture (nécessaire à
  // l'en-tête du document d'attestation).
  React.useEffect(() => {
    if (!open || organization) return;
    let cancelled = false;
    getCurrentOrganizationProfile()
      .then((profile) => {
        if (!cancelled) setOrganization(profile);
      })
      .catch(() => {
        /* dégradation silencieuse : valeurs de repli utilisées. */
      });
    return () => {
      cancelled = true;
    };
  }, [open, organization]);

  const handleClassChange = (classId: string) => {
    setSelectedClassId(classId);
    // Le message dépend de l'étudiant : on repart d'un brouillon neutre.
    setSelectedStudentId("");
    setMessageDraft(null);
    setFields(EMPTY_ATTESTATION_FIELDS);
  };

  const handleStudentChange = (studentId: string) => {
    setSelectedStudentId(studentId);
    // Réinitialise le brouillon pour régénérer le message par défaut du nouvel
    // étudiant sélectionné.
    setMessageDraft(null);
    // Pré-remplit les champs d'attestation depuis la fiche étudiant : date de
    // naissance, adresse/ville et date d'inscription à la cohorte. La fin
    // prévue et la date d'examen ne sont pas connues de la base : à saisir.
    const student = students.find((item) => item.id === studentId) ?? null;
    const enrollment = enrollmentLinks.find(
      (link) => link.studentId === studentId && link.classId === selectedClassId
    );
    setFields({
      ...EMPTY_ATTESTATION_FIELDS,
      birthDate: toAttestationDateInputValue(student?.dateOfBirth),
      city: student?.address ?? "",
      startDate: toAttestationDateInputValue(
        enrollment?.enrolledAt ?? student?.createdAt
      ),
    });
  };

  const handleClose = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setSelectedClassId("");
      setSelectedStudentId("");
      setMessageDraft(null);
      setFields(EMPTY_ATTESTATION_FIELDS);
    }
  };

  const handlePrint = async () => {
    if (!attestationInput) return;
    setPending(true);
    // S'assure que le profil est chargé avant de construire le document.
    const profile = organization ?? (await getCurrentOrganizationProfile());
    const html = buildInternalAttestationDocument(attestationInput, profile);
    setPending(false);
    printHtmlDocument(html);
  };

  /** Adapte la hauteur de l'iframe d'aperçu à son contenu. */
  const handlePreviewLoad = (
    event: React.SyntheticEvent<HTMLIFrameElement>
  ) => {
    try {
      const doc = event.currentTarget.contentDocument;
      if (!doc?.documentElement) return;
      const contentHeight = doc.documentElement.scrollHeight;
      if (contentHeight > 0) {
        event.currentTarget.style.height = `${Math.min(
          Math.max(contentHeight, 360),
          560
        )}px`;
      }
    } catch {
      /* iframe cross-origin : hauteur par défaut conservée. */
    }
  };

  // Aperçu mémoïsé : construit uniquement quand étudiant + organisation prêts.
  const previewHtml = React.useMemo(() => {
    if (!attestationInput || !organization) return "";
    return buildInternalAttestationDocument(attestationInput, organization);
  }, [attestationInput, organization]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Attestation de formation en cours</DialogTitle>
          <DialogDescription>
            Délivrez une attestation de suivi à un étudiant inscrit dans une
            classe encore active. Éditez librement le paragraphe (niveau B1/B2,
            délai avant examen…) puis imprimez ou enregistrez en PDF.
          </DialogDescription>
        </DialogHeader>

        {activeClasses.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-8 text-center">
            <p className="text-sm font-medium">Aucune classe active</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Les attestations de formation en cours ne concernent que les
              classes encore en exploitation (planifiée ou en cours). Les
              certificats de fin de niveau, eux, sont réservés aux classes
              clôturées ou archivées.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="attestation-class">Classe active</Label>
              <Select
                value={selectedClassId}
                onValueChange={handleClassChange}
              >
                <SelectTrigger id="attestation-class">
                  <SelectValue placeholder="Choisir une classe active…" />
                </SelectTrigger>
                <SelectContent>
                  {activeClasses.map((klass) => (
                    <SelectItem key={klass.id} value={klass.id}>
                      {klass.name} — {klass.courseTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="attestation-student">Étudiant inscrit</Label>
              {selectedClass && enrolledStudents.length === 0 ? (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Aucun étudiant n&apos;est actuellement inscrit dans cette
                  classe.
                </p>
              ) : (
                <Select
                  value={selectedStudentId}
                  onValueChange={handleStudentChange}
                  disabled={!selectedClass}
                >
                  <SelectTrigger id="attestation-student">
                    <SelectValue
                      placeholder={
                        selectedClass
                          ? "Choisir un étudiant…"
                          : "Choisissez d'abord une classe…"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {enrolledStudents.map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.firstName} {student.lastName} ·{" "}
                        {student.studentCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedStudent && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="attestation-birthDate">
                      Date de naissance
                    </Label>
                    <Input
                      id="attestation-birthDate"
                      type="date"
                      value={fields.birthDate}
                      onChange={(event) =>
                        setFields((prev) => ({
                          ...prev,
                          birthDate: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="attestation-city">Ville de résidence</Label>
                    <Input
                      id="attestation-city"
                      type="text"
                      placeholder="Ex : Abidjan"
                      value={fields.city}
                      onChange={(event) =>
                        setFields((prev) => ({
                          ...prev,
                          city: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="attestation-startDate">
                      Début du cours
                    </Label>
                    <Input
                      id="attestation-startDate"
                      type="date"
                      value={fields.startDate}
                      onChange={(event) =>
                        setFields((prev) => ({
                          ...prev,
                          startDate: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="attestation-expectedEndDate">
                      Fin prévue du cours
                    </Label>
                    <Input
                      id="attestation-expectedEndDate"
                      type="date"
                      value={fields.expectedEndDate}
                      onChange={(event) =>
                        setFields((prev) => ({
                          ...prev,
                          expectedEndDate: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="attestation-examDate">
                      Date de l&apos;examen officiel
                    </Label>
                    <Input
                      id="attestation-examDate"
                      type="date"
                      value={fields.examDate}
                      onChange={(event) =>
                        setFields((prev) => ({
                          ...prev,
                          examDate: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="attestation-message">
                    Paragraphe de l&apos;attestation (modifiable)
                  </Label>
                  <Textarea
                    id="attestation-message"
                    value={message}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    rows={5}
                    maxLength={2000}
                  />
                  <p className="text-xs text-muted-foreground">
                    Pré-rempli avec la formulation officielle de
                    l&apos;établissement pour un cursus en cours. Renseignez la
                    date de fin prévue et la date de l&apos;examen (inconnues de
                    la base), puis personnalisez le texte si besoin. Les
                    variables <code>{"{{studentName}}"}</code>,{" "}
                    <code>{"{{birthDate}}"}</code>, <code>{"{{city}}"}</code>,{" "}
                    <code>{"{{startDate}}"}</code>,{" "}
                    <code>{"{{expectedEndDate}}"}</code>,{" "}
                    <code>{"{{examDate}}"}</code>,{" "}
                    <code>{"{{courseName}}"}</code> et{" "}
                    <code>{"{{organizationName}}"}</code> sont remplacées et
                    affichées en gras.
                  </p>
                </div>

                <div className="rounded-md border bg-muted/40 p-3">
                  {previewHtml ? (
                    <iframe
                      title="Aperçu de l'attestation de formation en cours"
                      srcDoc={previewHtml}
                      onLoad={handlePreviewLoad}
                      className="h-[420px] w-full rounded-md border bg-white"
                    />
                  ) : (
                    <div className="flex h-[420px] items-center justify-center text-sm text-muted-foreground">
                      Chargement de l&apos;aperçu…
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={pending}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handlePrint}
            disabled={!selectedStudent || pending}
          >
            {pending ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : (
              <PrinterIcon data-icon="inline-start" />
            )}
            Imprimer / Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

