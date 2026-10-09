-- Module Échéances / Tranches de paiement & système de relances.
--
-- Objectifs métier :
--   1. Échéanciers PAR DÉFAUT réutilisables, paramétrables au niveau d'un Cours
--      (frais de scolarité) et d'un Workflow de procédure voyage (coût du
--      dossier) : nombre de tranches, montant de chaque tranche, intervalle.
--   2. Activation conditionnelle du décompte des impayés : l'échéancier d'un
--      étudiant n'est « activé » (donc susceptible de passer en retard) qu'une
--      fois l'étudiant inscrit dans une classe ET cette classe officiellement
--      démarrée (statut IN_PROGRESS / ACTIVE).
--
-- Changements :
--   - `PaymentSchedule` : + `classId` (nullable) et `activatedAt` (nullable).
--   - Nouvelles tables `CoursePaymentSchedule(+Item)` et
--     `WorkflowPaymentSchedule(+Item)` : modèles d'échéanciers réutilisables.

-- AlterTable : rattachement d'un échéancier étudiant à la classe qui l'a activé.
ALTER TABLE "PaymentSchedule" ADD COLUMN     "classId" TEXT,
ADD COLUMN     "activatedAt" TIMESTAMP(3);

-- CreateTable : modèle d'échéancier de cours.
CREATE TABLE "CoursePaymentSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "installmentsCount" INTEGER NOT NULL,
    "intervalDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoursePaymentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable : tranches du modèle d'échéancier de cours.
CREATE TABLE "CoursePaymentScheduleItem" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoursePaymentScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable : modèle d'échéancier de procédure voyage.
CREATE TABLE "WorkflowPaymentSchedule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "installmentsCount" INTEGER NOT NULL,
    "intervalDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowPaymentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable : tranches du modèle d'échéancier de procédure voyage.
CREATE TABLE "WorkflowPaymentScheduleItem" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowPaymentScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoursePaymentSchedule_courseId_key" ON "CoursePaymentSchedule"("courseId");

-- CreateIndex
CREATE INDEX "CoursePaymentSchedule_organizationId_idx" ON "CoursePaymentSchedule"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "CoursePaymentScheduleItem_scheduleId_installmentNumber_key" ON "CoursePaymentScheduleItem"("scheduleId", "installmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowPaymentSchedule_workflowId_key" ON "WorkflowPaymentSchedule"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowPaymentSchedule_organizationId_idx" ON "WorkflowPaymentSchedule"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowPaymentScheduleItem_scheduleId_installmentNumber_key" ON "WorkflowPaymentScheduleItem"("scheduleId", "installmentNumber");

-- CreateIndex
CREATE INDEX "PaymentSchedule_classId_idx" ON "PaymentSchedule"("classId");

-- CreateIndex
CREATE INDEX "PaymentSchedule_activatedAt_idx" ON "PaymentSchedule"("activatedAt");

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePaymentSchedule" ADD CONSTRAINT "CoursePaymentSchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePaymentSchedule" ADD CONSTRAINT "CoursePaymentSchedule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoursePaymentScheduleItem" ADD CONSTRAINT "CoursePaymentScheduleItem_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "CoursePaymentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowPaymentSchedule" ADD CONSTRAINT "WorkflowPaymentSchedule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowPaymentSchedule" ADD CONSTRAINT "WorkflowPaymentSchedule_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowPaymentScheduleItem" ADD CONSTRAINT "WorkflowPaymentScheduleItem_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "WorkflowPaymentSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
