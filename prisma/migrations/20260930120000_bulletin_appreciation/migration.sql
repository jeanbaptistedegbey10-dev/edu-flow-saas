-- Appréciation PERSONNALISÉE d'un bulletin (examen ou récapitulatif).
--
-- Le texte d'appréciation affiché sur le bulletin reste généré
-- automatiquement par défaut (« 3 modules validés sur 4… ») : cette table ne
-- contient une ligne QUE lorsqu'un enseignant / administrateur a saisi son
-- propre texte via le bouton « Modifier l'appréciation ».
--
-- `scope` porte la clé du bulletin pour éviter deux tables :
--   - « exam:<evaluationId> » → bulletin d'une session d'examen précise ;
--   - « recap:<classId> »     → bulletin récapitulatif de la classe
--     (« recap:global » si l'étudiant n'a pas de classe active).
--
-- Les colonnes de la clé unique sont NON NULES : PostgreSQL considère NULLs
-- comme distincts dans un index unique, ce qui laisserait passer plusieurs
-- lignes « récapitulatif global » pour un même étudiant.

-- CreateTable
CREATE TABLE "BulletinAppreciation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BulletinAppreciation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BulletinAppreciation_organizationId_studentId_scope_key" ON "BulletinAppreciation"("organizationId", "studentId", "scope");

-- CreateIndex
CREATE INDEX "BulletinAppreciation_studentId_idx" ON "BulletinAppreciation"("studentId");

-- AddForeignKey
ALTER TABLE "BulletinAppreciation" ADD CONSTRAINT "BulletinAppreciation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BulletinAppreciation" ADD CONSTRAINT "BulletinAppreciation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;