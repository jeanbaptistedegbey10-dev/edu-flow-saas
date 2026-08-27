import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftIcon,
  BadgePercentIcon,
  BanknoteIcon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  MailIcon,
  PhoneIcon,
  ReceiptTextIcon,
  WalletIcon,
} from "lucide-react";

import { getStudentDetail } from "@/actions/students";
import { getStudentAcademicRecord } from "@/actions/evaluations";
import { getCurrentOrganizationProfile } from "@/actions/payments";
import {
  getDocumentsByOwner,
} from "@/actions/documents";
import { DocumentsTab } from "@/components/documents/documents-tab";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StudentAcademicTab } from "@/components/students/student-academic-tab";
import {
  getPaymentMethodLabel,
  getPaymentStatusBadgeClass,
  getPaymentStatusLabel,
} from "@/lib/payment-status";
import {
  getStudentStatusBadgeClass,
  getStudentStatusLabel,
} from "@/lib/student-status";
import type { PaymentMethod, PaymentStatus } from "@prisma/client";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Fiche étudiant | EduFlow",
  description:
    "Fiche détaillée d'un étudiant : informations, suivi financier et évaluations.",
};

// Formatage déterministe (locale + fuseau fixes) pour éviter tout écart
// d'hydratation et garantir un rendu stable côté serveur.
const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const numberFormatter = new Intl.NumberFormat("fr-FR");

function formatAmount(amount: number): string {
  return `${numberFormatter.format(amount)} FCFA`;
}

const BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

/** Ligne du récapitulatif financier. */
function SummaryRow({
  label,
  value,
  icon,
  valueClasses,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  valueClasses?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="[&_svg]:size-4">{icon}</span>
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          valueClasses
        )}
      >
        {value}
      </span>
    </div>
  );
}

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Les actions lèvent une erreur si l'étudiant est introuvable ou hors
  // organisation ; le profil d'organisation alimente l'en-tête des documents.
  let student;
  let academicRecord;
  let organization;
  let documents;

  try {
    [student, academicRecord, organization, documents] = await Promise.all([
      getStudentDetail(id),
      getStudentAcademicRecord(id),
      getCurrentOrganizationProfile(),
      // Pièces jointes rattachées à l'étudiant (isolation multi-tenant).
      getDocumentsByOwner({ studentId: id }),
    ]);
  } catch {
    notFound();
  }

  const hasFinancials = student.netAmount !== null;
  const isFullyPaid =
    hasFinancials && student.remainingAmount !== null && student.remainingAmount <= 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
      {/* Fil d'Ariane */}
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/dashboard/students">
            <ArrowLeftIcon data-icon="inline-start" />
            Retour aux étudiants
          </Link>
        </Button>
      </div>

      {/* En-tête : identité de l'étudiant */}
      <div className="rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 p-5 shadow-sm dark:border-slate-800 dark:from-card dark:to-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">
                {student.firstName} {student.lastName}
              </h2>
              <span
                className={cn(
                  BADGE_BASE_CLASSES,
                  getStudentStatusBadgeClass(student.status)
                )}
              >
                {getStudentStatusLabel(student.status)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Code étudiant :{" "}
              <span className="font-mono">{student.studentCode}</span> · inscrit
              le {dateFormatter.format(student.createdAt)}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <PhoneIcon className="size-4 shrink-0" />
                {student.phone}
              </span>
              {student.email ? (
                <span className="flex items-center gap-2">
                  <MailIcon className="size-4 shrink-0" />
                  {student.email}
                </span>
              ) : null}
              {student.currentClassName ? (
                <span className="flex items-center gap-2">
                  <ClipboardCheckIcon className="size-4 shrink-0" />
                  Classe : {student.currentClassName}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Onglets : vue d'ensemble financière / évaluations & notes / documents */}
      <Tabs defaultValue="overview" className="gap-4">
        <TabsList>
          <TabsTrigger value="overview">Vue d’ensemble</TabsTrigger>
          <TabsTrigger value="academics">Évaluations & Notes</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* Onglet 1 : récapitulatif financier (contenu historique) */}
        <TabsContent value="overview" className="mt-2 flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
            <section className="rounded-xl border border-slate-200/80 bg-card p-5 shadow-sm dark:border-slate-800">
              <h3 className="flex items-center gap-2 font-semibold">
                <WalletIcon className="size-4" />
                Récapitulatif financier
              </h3>

              {hasFinancials ? (
                <>
                  <div className="mt-3">
                    <SummaryRow
                      label="Coût initial de la formation"
                      icon={<BanknoteIcon />}
                      value={formatAmount(student.totalCost ?? 0)}
                    />
                    <SummaryRow
                      label="Réduction accordée"
                      icon={<BadgePercentIcon />}
                      value={`− ${formatAmount(student.discount ?? 0)}`}
                      valueClasses="text-emerald-600 dark:text-emerald-400"
                    />
                    <SummaryRow
                      label="Net à payer"
                      icon={<WalletIcon />}
                      value={formatAmount(student.netAmount ?? 0)}
                    />
                    <SummaryRow
                      label="Montant déjà encaissé"
                      icon={<ReceiptTextIcon />}
                      value={formatAmount(student.paidAmount)}
                    />
                    <SummaryRow
                      label="Reste à payer"
                      icon={<BanknoteIcon />}
                      value={formatAmount(student.remainingAmount ?? 0)}
                      valueClasses={
                        isFullyPaid
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }
                    />
                  </div>

                  {/* Bandeau d'état : soldé / solde restant */}
                  <p
                    role="status"
                    className={cn(
                      "mt-4 rounded-md px-3 py-2 text-sm font-medium",
                      isFullyPaid
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                        : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400"
                    )}
                  >
                    {isFullyPaid
                      ? "✅ Formation intégralement payée."
                      : `⚠️ Il reste ${formatAmount(
                          student.remainingAmount ?? 0
                        )} à encaisser.`}
                  </p>
                </>
              ) : (
                <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                  Aucun financement défini pour cet étudiant. Renseignez le coût
                  total de la formation via « Modifier » depuis la liste des
                  étudiants.
                </p>
              )}
            </section>

            {/* Historique des règlements */}
            <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-card shadow-sm dark:border-slate-800">
              <div className="border-b px-4 py-3">
                <h3 className="text-sm font-semibold">Historique des règlements</h3>
                <p className="text-xs text-muted-foreground">
                  {student.payments.length} transaction
                  {student.payments.length > 1 ? "s" : ""} enregistrée
                  {student.payments.length > 1 ? "s" : ""}
                </p>
              </div>

              {student.payments.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
                  <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                    <ReceiptTextIcon className="size-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">Aucun règlement</p>
                  <p className="max-w-xs text-sm text-muted-foreground">
                    Enregistrez un règlement depuis la section « Paiements ».
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Date</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Moyen</TableHead>
                      <TableHead>Référence</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {student.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <CalendarDaysIcon className="size-3.5 shrink-0" />
                            {dateFormatter.format(payment.paidAt)}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {formatAmount(payment.amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {getPaymentMethodLabel(payment.paymentMethod as PaymentMethod)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {payment.reference ?? "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              BADGE_BASE_CLASSES,
                              getPaymentStatusBadgeClass(payment.status as PaymentStatus)
                            )}
                          >
                            {getPaymentStatusLabel(payment.status as PaymentStatus)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </div>
        </TabsContent>

        {/* Onglet 2 : évaluations internes, progression et bulletins */}
        <TabsContent value="academics" className="mt-2">
          <StudentAcademicTab
            record={academicRecord}
            studentName={`${student.firstName} ${student.lastName}`}
            studentCode={student.studentCode}
            className={student.currentClassName}
            courseTitle={student.currentCourseTitle}
            organization={organization}
          />
        </TabsContent>

        {/* Onglet 3 : pièces jointes (liens externes / stockage cloud) */}
        <TabsContent value="documents" className="mt-2">
          <DocumentsTab
            owner={{ studentId: student.id }}
            initialDocuments={documents}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}