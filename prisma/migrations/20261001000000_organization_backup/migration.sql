-- Sauvegardes automatiques avant purge / restauration (Auto-Backup / Restore).
--
-- Objectif : la suppression des données de démonstration (ou la réinitialisation
-- complète de l'organisation) n'est JAMAIS « sans filet ». Avant chaque purge,
-- l'intégralité des tables métier est sérialisée dans `dataJson` ; la purge
-- n'est engagée qu'après l'écriture réussie de ce snapshot.
--
-- - `reason`        : AUTO_PURGE (avant suppression), AUTO_RESTORE (garde-fou
--                     avant restauration), MANUAL (à la demande) ;
-- - `schemaVersion` : version du format JSON (évolutivité du snapshot) ;
-- - `sizeBytes`     : poids du snapshot (affichage / diagnostic) ;
-- - `rowCount`      : nombre total de lignes sauvegardées ;
-- - `createdById`   : auteur de la sauvegarde (SetNull : la suppression du
--                     compte ne doit pas faire perdre l'historique) ;
-- - `expiresAt`     : fin de validité (14 jours par défaut) permettant de
--                     purger automatiquement les sauvegardes obsolètes.

-- CreateTable
CREATE TABLE "organization_backups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "backupName" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'AUTO_PURGE',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "dataJson" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_backups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organization_backups_organizationId_createdAt_idx" ON "organization_backups"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "organization_backups_expiresAt_idx" ON "organization_backups"("expiresAt");

-- AddForeignKey
ALTER TABLE "organization_backups" ADD CONSTRAINT "organization_backups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_backups" ADD CONSTRAINT "organization_backups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
