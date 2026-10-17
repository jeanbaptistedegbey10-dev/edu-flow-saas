"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AwardIcon,
  EyeIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  ShieldXIcon,
  FileTextIcon,
} from "lucide-react";

import type { ClassDTO } from "@/actions/classes";
import type { CourseDTO } from "@/actions/courses";
import type { StudentDTO } from "@/actions/students";
import type { ClassStatus } from "@prisma/client";
import {
  revokeCertificate,
  type CertificateDTO,
  type CertificateEnrollmentLinkDTO,
} from "@/lib/actions/certificates";
import { CLASS_STATUS_BADGE_CLASSES } from "@/lib/class-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToastNotification } from "@/components/ui/toast";
import { GenerateCertificateDialog } from "@/components/certificates/generate-certificate-dialog";
import { GenerateAttestationDialog } from "@/components/certificates/generate-attestation-dialog";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Valeur sentinelle des filtres déroulants « tout afficher ». */
const ALL_VALUE = "ALL";

/** Statuts de classe qualifiés d'« officiels » pour les certificats de fin. */
const OFFICIAL_CERT_STATUSES = ["ARCHIVED", "COMPLETED"];

/** Base commune des badges de statut (les couleurs viennent de class-status). */
const badgeBase =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/** Libellés « orientés certificat » du statut de la classe d'origine. */
const CLASS_ORIGIN_BADGE_LABELS: Record<ClassStatus, string> = {
  PLANIFIED: "Classe programmée",
  IN_PROGRESS: "Classe en cours",
  ACTIVE: "Classe en cours",
  COMPLETED: "Classe clôturée",
  ARCHIVED: "Classe archivée",
};

export function CertificatesView({
  certificates,
  students,
  courses,
  classes,
  enrollmentLinks,
}: {
  certificates: CertificateDTO[];
  students: StudentDTO[];
  courses: CourseDTO[];
  classes: ClassDTO[];
  /** Historique des affectations étudiant ↔ classe (éligibilité du modal). */
  enrollmentLinks: CertificateEnrollmentLinkDTO[];
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [yearFilter, setYearFilter] = React.useState(ALL_VALUE);
  const [courseFilter, setCourseFilter] = React.useState(ALL_VALUE);
  const [classFilter, setClassFilter] = React.useState(ALL_VALUE);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [attestationDialogOpen, setAttestationDialogOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);

  /** Années académiques présentes dans les certificats (plus récentes d'abord). */
  const yearOptions = React.useMemo(
    () =>
      Array.from(new Set(certificates.map((cert) => cert.academicYear))).sort(
        (a, b) => b.localeCompare(a)
      ),
    [certificates]
  );

  /**
   * La recherche textuelle (nom, prénom, matricule, code de vérification —
   * et aussi niveau / cours) se COMBINE (ET logique) avec les filtres.
   */
  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase();

    return certificates.filter((cert) => {
      if (yearFilter !== ALL_VALUE && cert.academicYear !== yearFilter) {
        return false;
      }
      if (courseFilter !== ALL_VALUE && cert.courseId !== courseFilter) {
        return false;
      }
      if (
        classFilter !== ALL_VALUE &&
        cert.classContext?.classId !== classFilter
      ) {
        return false;
      }
      if (!term) return true;

      return [
        cert.studentName, // couvre le nom ET le prénom
        cert.studentCode, // numéro matricule de l'étudiant
        cert.verificationCode,
        cert.level,
        cert.courseTitle ?? "",
      ].some((value) => value.toLowerCase().includes(term));
    });
  }, [certificates, search, yearFilter, courseFilter, classFilter]);

  const hasActiveFilters =
    yearFilter !== ALL_VALUE ||
    courseFilter !== ALL_VALUE ||
    classFilter !== ALL_VALUE ||
    search.trim() !== "";

  const handleRevoke = async (certId: string) => {
    setRevokingId(certId);
    const result = await revokeCertificate(certId, "Révocation manuelle");
    setRevokingId(null);
    if (result.ok) {
      setToast("Certificat révoqué.");
    } else {
      setToast(result.message);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setYearFilter(ALL_VALUE);
    setCourseFilter(ALL_VALUE);
    setClassFilter(ALL_VALUE);
  };

  return (
    <div className="space-y-4">
      {/* Recherche globale + action de génération */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, prénom, matricule ou code de vérification…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <PlusIcon className="size-4" />
          Générer un certificat
        </Button>
        <Button
          onClick={() => setAttestationDialogOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <FileTextIcon className="size-4" />
          Générer une attestation de formation en cours
        </Button>
      </div>

      {/* Ruban de filtres — se combine (ET logique) avec la recherche textuelle */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger
            size="sm"
            aria-label="Filtrer par année académique"
            className="w-full sm:w-44"
          >
            <SelectValue placeholder="Toutes les années" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Toutes les années</SelectItem>
            {yearOptions.map((year) => (
              <SelectItem key={year} value={year}>
                {year.replace("-", "/")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger
            size="sm"
            aria-label="Filtrer par cours / parcours"
            className="w-full sm:w-56"
          >
            <SelectValue placeholder="Tous les cours" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Tous les cours</SelectItem>
            {courses.map((course) => (
              <SelectItem key={course.id} value={course.id}>
                {course.title} ({course.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger
            size="sm"
            aria-label="Filtrer par classe"
            className="w-full sm:w-56"
          >
            <SelectValue placeholder="Toutes les classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Toutes les classes</SelectItem>
            {classes
              .filter((klass) => OFFICIAL_CERT_STATUSES.includes(klass.status))
              .map((klass) => (
                <SelectItem key={klass.id} value={klass.id}>
                  {klass.name} — {klass.courseTitle}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetFilters}
          >
            Réinitialiser
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} certificat{filtered.length > 1 ? "s" : ""}
        </span>
      </div>

      {filtered.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Apprenant</TableHead>
                <TableHead>Matricule</TableHead>
                <TableHead>Niveau</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Note</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cert) => (
                <TableRow key={cert.id} className={cert.revoked ? "opacity-60" : ""}>
                  <TableCell className="font-medium">{cert.studentName}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {cert.studentCode}
                  </TableCell>
                  <TableCell>{cert.level}</TableCell>
                  <TableCell>
                    {cert.classContext ? (
                      <div className="flex flex-col items-start gap-1">
                        <span>{cert.classContext.className}</span>
                        <span
                          className={`${badgeBase} ${CLASS_STATUS_BADGE_CLASSES[cert.classContext.classStatus]}`}
                        >
                          {CLASS_ORIGIN_BADGE_LABELS[cert.classContext.classStatus]}
                        </span>
                      </div>
                    ) : (
                      <span className="italic text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {cert.score !== null ? `${cert.score.toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell>{dateFormatter.format(cert.issueDate)}</TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {cert.verificationCode}
                    </code>
                  </TableCell>
                  <TableCell>
                    {cert.revoked ? (
                      <span className="inline-flex items-center rounded-full border border-red-200/60 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                        Révoqué
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
                        Valide
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() =>
                          window.open(`/verify/${cert.verificationCode}`, "_blank")
                        }
                        title="Voir la vérification"
                      >
                        <EyeIcon className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-navy hover:text-navy"
                        onClick={() => router.push(`/dashboard/certificates/${cert.id}`)}
                        title="Voir le certificat"
                      >
                        <FileTextIcon className="size-4" />
                      </Button>
                      {!cert.revoked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                          onClick={() => handleRevoke(cert.id)}
                          disabled={revokingId === cert.id}
                          title="Révoquer"
                        >
                          {revokingId === cert.id ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            <ShieldXIcon className="size-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <AwardIcon className="size-6 text-muted-foreground" />
          </div>
          {hasActiveFilters ? (
            <>
              <p className="font-medium">
                Aucun certificat ne correspond aux filtres
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Modifiez la recherche ou réinitialisez les filtres pour afficher
                davantage de résultats.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Aucun certificat pour le moment</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Les certificats sont générés automatiquement lors de la clôture
                d&apos;une classe, ou manuellement via le bouton « Générer un
                certificat ».
              </p>
            </>
          )}
        </div>
      )}

      <GenerateCertificateDialog
        classes={classes}
        students={students}
        enrollmentLinks={enrollmentLinks}
        certificates={certificates}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onGenerated={() => router.refresh()}
      />

      <GenerateAttestationDialog
        classes={classes}
        students={students}
        enrollmentLinks={enrollmentLinks}
        open={attestationDialogOpen}
        onOpenChange={setAttestationDialogOpen}
      />

      <ToastNotification message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
