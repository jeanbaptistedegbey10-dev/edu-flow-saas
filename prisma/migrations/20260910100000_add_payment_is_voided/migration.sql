-- AlterTable
-- Écriture suspendue (hors trésorerie active) : valorisée lorsque le statut
-- d'un étudiant repasse à PROSPECT (« Inscrit ➔ Prospect ») ; restaurée lors
-- d'une réinscription (« Prospect ➔ Inscrit »). Les enregistrements et reçus
-- sont conservés — seul l'impact comptable actif change.
ALTER TABLE "Payment" ADD COLUMN "isVoided" BOOLEAN NOT NULL DEFAULT false;
