-- Ajoute la clôture explicite de la séance du jour (bouton « Terminer la séance »).
ALTER TABLE "ClassSession" ADD COLUMN "isCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClassSession" ADD COLUMN "endedAt" TIMESTAMP(3);
