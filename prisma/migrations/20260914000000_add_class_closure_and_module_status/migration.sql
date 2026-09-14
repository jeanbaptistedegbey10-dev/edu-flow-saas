-- Clôture de classe, validation par module et gestion financière de réinscription
-- 1) Nouveaux types énumérés
CREATE TYPE "ClassStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

CREATE TYPE "ClassEnrollmentStatus" AS ENUM (
    'ACTIVE',
    'PASSED',
    'FAILED',
    'PROMOTED_MANUALLY',
    'DROPPED'
);

CREATE TYPE "ModuleStatus" AS ENUM ('VALIDATED', 'FAILED', 'RETAKE');

-- 2) Statut pédagogique de la classe
ALTER TABLE "Class" ADD COLUMN "status" "ClassStatus" NOT NULL DEFAULT 'ACTIVE';

-- 3) Inscription d'un étudiant dans une classe : statut de décision + appréciation
ALTER TABLE "ClassEnrollment"
    ADD COLUMN "status" "ClassEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN "finalDecisionNote" TEXT;

-- 4) Seuil de validation par défaut d'une session d'évaluation (passMark)
ALTER TABLE "Evaluation" ADD COLUMN "passMark" DOUBLE PRECISION NOT NULL DEFAULT 60;

-- 5) Note (Grade) : snapshot du seuil de validation + statut calculé du module
ALTER TABLE "Grade"
    ADD COLUMN "passMark" DOUBLE PRECISION NOT NULL DEFAULT 60,
    ADD COLUMN "status" "ModuleStatus";

-- 6) Rétro-remplissage : le seuil de chaque note est figé depuis le barème du
--    module (passingScore), et le statut est calculé depuis la note obtenue.
UPDATE "Grade" g
SET
    "passMark" = COALESCE(
        (SELECT m."passingScore" FROM "EvaluationModule" m WHERE m."id" = g."evaluationModuleId"),
        60
    );

UPDATE "Grade" g
SET "status" = CASE
    WHEN g."score" >= g."passMark" THEN 'VALIDATED'
    ELSE 'FAILED'
END;

-- 7) Index de requêtes (isolation par organisation + statuts de décision)
CREATE INDEX "Class_organizationId_status_idx" ON "Class"("organizationId", "status");
CREATE INDEX "ClassEnrollment_studentId_status_idx" ON "ClassEnrollment"("studentId", "status");
CREATE INDEX "ClassEnrollment_organizationId_idx" ON "ClassEnrollment"("organizationId");
CREATE INDEX "Grade_studentId_status_idx" ON "Grade"("studentId", "status");
