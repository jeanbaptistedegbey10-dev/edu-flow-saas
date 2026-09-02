#!/bin/sh
# =============================================================================
# EduFlow — Initialisation de la base de données (conteneur `migrate`)
# =============================================================================
# Exécuté par le service `migrate` du docker-compose AVANT le démarrage du Web :
#
#   1. Attente de la disponibilité de PostgreSQL ;
#   2. `prisma migrate deploy`  (idempotent — rejouable sans risque) ;
#   3. Seed des données de démarrage SEULEMENT si la base est vide
#      (premier démarrage ⇒ « au premier démarrage » sans jamais écraser
#      des données existantes lors d'un redémarrage).
#
# Tout échec fait quitter le conteneur avec un code ≠ 0 : docker compose
# interrompt alors le démarrage du service `web`.
# =============================================================================
set -eu

echo "[eduflow:init] ⏳ Initialisation de la base de données…"

# 1. PostgreSQL accessible ?
node /app/scripts/docker-init-wait.mjs

# 2. Migrations
echo "[eduflow:init] ⋙ Application des migrations Prisma (prisma migrate deploy)…"
npx prisma migrate deploy

# 2b. Activation de Row Level Security (RLS) sur toutes les tables publiques
echo "[eduflow:init] ⋙ Activation de RLS sur toutes les tables publiques…"
npx prisma db execute --file ./prisma/migrations/enable_rls_all_tables.sql

# 3. Seed conditionnel (premier démarrage uniquement)
if node /app/scripts/docker-seed-check.mjs >/dev/null 2>&1; then
  echo "[eduflow:init] ⋙ Base vide — exécution du seed de démarrage…"
  npx tsx /app/prisma/seed.ts
else
  echo "[eduflow:init] • Des données existent déjà dans la base — seed ignoré."
fi

echo "[eduflow:init] ✅ Initialisation terminée."
exit 0