-- Séparation stricte Étudiant / Inscription (Étape 1/3 — cycle de vie des classes)
--
-- 1. Les notes (Grade), présences (Attendance), échéanciers (PaymentSchedule)
--    et règlements (Payment) gagnent `enrollmentId` : le rattachement par
--    cohorte passe par l'inscription (classe + année académique), plus par le
--    seul profil étudiant. Colonnes NULL tolérées pour l'historique antérieur.
-- 2. Unicité d'inscription élargie à (studentId, classId, academicYear) :
--    une réinscription dans une même classe crée une NOUVELLE ligne sans
--    écraser l'historique des années précédentes.
-- 3. Nouveau statut d'inscription COMPLETED (clôture sans décision explicite)
--    et scellement comptable des échéanciers (PaymentSchedule.sealedAt).

-- AlterEnum
ALTER TYPE "ClassEnrollmentStatus" ADD VALUE 'COMPLETED';

-- DropIndex
DROP INDEX "ClassEnrollment_studentId_classId_key";

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "enrollmentId" TEXT;

-- AlterTable
ALTER TABLE "Grade" ADD COLUMN     "enrollmentId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "enrollmentId" TEXT;

-- AlterTable
ALTER TABLE "PaymentSchedule" ADD COLUMN     "enrollmentId" TEXT,
ADD COLUMN     "sealedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Attendance_enrollmentId_idx" ON "Attendance"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassEnrollment_studentId_classId_academicYear_key" ON "ClassEnrollment"("studentId", "classId", "academicYear");

-- CreateIndex
CREATE INDEX "Grade_enrollmentId_idx" ON "Grade"("enrollmentId");

-- CreateIndex
CREATE INDEX "Payment_enrollmentId_idx" ON "Payment"("enrollmentId");

-- CreateIndex
CREATE INDEX "PaymentSchedule_enrollmentId_idx" ON "PaymentSchedule"("enrollmentId");

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ClassEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ClassEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ClassEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSchedule" ADD CONSTRAINT "PaymentSchedule_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ClassEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill : rattache les données existantes à l'inscription correspondante.
-- Avant cette migration, l'unicité (studentId, classId) garantit UNE seule
-- inscription par couple étudiant/classe : le rattachement est donc non
-- ambigu. Les écritures sans correspondance restent à NULL (compatibilité).
-- ---------------------------------------------------------------------------

-- Notes : evaluationModule -> evaluation -> classe de l'évaluation.
-- (Références à la table cible uniquement dans le WHERE — interdites dans un
-- JOIN de FROM pour une cible d'UPDATE en PostgreSQL.)
UPDATE "Grade" g
SET "enrollmentId" = ce."id"
FROM "EvaluationModule" em
JOIN "Evaluation" e ON e."id" = em."evaluationId"
JOIN "ClassEnrollment" ce
  ON ce."classId" = e."classId"
WHERE g."evaluationModuleId" = em."id"
  AND g."enrollmentId" IS NULL
  AND ce."studentId" = g."studentId";

-- Présences : séance -> classe de la séance.
UPDATE "Attendance" a
SET "enrollmentId" = ce."id"
FROM "ClassSession" s
JOIN "ClassEnrollment" ce
  ON ce."classId" = s."classId"
WHERE a."sessionId" = s."id"
  AND a."enrollmentId" IS NULL
  AND ce."studentId" = a."studentId";

-- Échéanciers rattachés à une classe (les échéanciers autonomes restent NULL).
UPDATE "PaymentSchedule" ps
SET "enrollmentId" = ce."id"
FROM "ClassEnrollment" ce
WHERE ps."classId" IS NOT NULL
  AND ps."enrollmentId" IS NULL
  AND ce."classId" = ps."classId"
  AND ce."studentId" = ps."studentId";

-- Règlements : inscription courante de l'étudiant (classe active du profil).
UPDATE "Payment" p
SET "enrollmentId" = ce."id"
FROM "Student" st
JOIN "ClassEnrollment" ce
  ON ce."studentId" = st."id" AND ce."classId" = st."currentClassId"
WHERE p."studentId" = st."id"
  AND p."enrollmentId" IS NULL;
