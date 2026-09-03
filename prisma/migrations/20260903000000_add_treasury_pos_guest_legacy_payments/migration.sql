-- Trésorerie : solde initial de caisse (configurable par organisation)
ALTER TABLE "Organization" ADD COLUMN "initialCashBalance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- POS : coordonnées optionnelles du client de passage (facturette)
ALTER TABLE "Sale" ADD COLUMN "guestName" TEXT;
ALTER TABLE "Sale" ADD COLUMN "guestPhone" TEXT;

-- Paiements antérieurs hors système (adoption du logiciel)
ALTER TABLE "Student" ADD COLUMN "legacyPaidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Student" ADD COLUMN "legacyAmountInCashJournal" BOOLEAN NOT NULL DEFAULT false;
