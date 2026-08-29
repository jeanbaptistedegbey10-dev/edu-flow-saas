-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "licenseEndsAt" TIMESTAMP(3),
ADD COLUMN     "licenseKey" TEXT,
ADD COLUMN     "planStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "planType" TEXT NOT NULL DEFAULT 'TRIAL',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_licenseKey_key" ON "Organization"("licenseKey");

