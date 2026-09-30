-- Relevé Global Étudiant (Vue 360°) : historique multi-classes + achats caisse.

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('TUITION', 'BOOK', 'SERVICE', 'OTHER');

-- AlterTable
-- Année académique de l'inscription (« 2025-2026 »). Colonne ajoutée en trois
-- temps (nullable → backfill → NOT NULL) pour rester sûre sur une base déjà
-- peuplée : la valeur est déduite de l'année d'inscription (`enrolledAt`).
ALTER TABLE "ClassEnrollment" ADD COLUMN "academicYear" TEXT;

UPDATE "ClassEnrollment"
SET "academicYear" = to_char("enrolledAt", 'YYYY') || '-' || (to_char("enrolledAt", 'YYYY')::int + 1)
WHERE "academicYear" IS NULL;

ALTER TABLE "ClassEnrollment" ALTER COLUMN "academicYear" SET NOT NULL;

-- CreateTable
CREATE TABLE "StudentTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentTransaction_organizationId_idx" ON "StudentTransaction"("organizationId");

-- CreateIndex
CREATE INDEX "StudentTransaction_studentId_idx" ON "StudentTransaction"("studentId");

-- CreateIndex
CREATE INDEX "StudentTransaction_studentId_createdAt_idx" ON "StudentTransaction"("studentId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudentTransaction" ADD CONSTRAINT "StudentTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentTransaction" ADD CONSTRAINT "StudentTransaction_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;