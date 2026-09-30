-- Traçabilité de l'auteur des écritures financières.
--
-- Objectif : chaque vente (Sale) et chaque règlement (Payment) conserve
-- l'IDENTIFIANT et le NOM de l'utilisateur connecté au moment de la saisie,
-- directement dans les métadonnées de la transaction (et non uniquement dans
-- le Journal d'Audit).
--
-- - `Sale.createdByName` : le `createdById` existait déjà ; on y ajoute le nom
--   du caissier, figé au moment de l'encaissement.
-- - `Payment.createdById` / `Payment.createdByName` : le règlement ne
--   conservait aucun auteur. Les deux colonnes sont NULLABLES afin de
--   préserver les règlements antérieurs (seed, imports, écritures
--   automatiques de clôture) qui n'ont pas d'auteur identifiable.

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "createdByName" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "createdByName" TEXT;

-- CreateIndex
CREATE INDEX "Payment_organizationId_createdById_idx" ON "Payment"("organizationId", "createdById");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
