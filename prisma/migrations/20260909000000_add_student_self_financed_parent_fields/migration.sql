ALTER TABLE "Student" ADD COLUMN "isSelfFinanced" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Student" ADD COLUMN "parentName" TEXT;
ALTER TABLE "Student" ADD COLUMN "parentRelation" TEXT;
ALTER TABLE "Student" ADD COLUMN "parentPhone1" TEXT;
ALTER TABLE "Student" ADD COLUMN "parentPhone2" TEXT;
ALTER TABLE "Student" ADD COLUMN "publicReportToken" TEXT;
CREATE UNIQUE INDEX "Student_publicReportToken_key" ON "Student"("publicReportToken");