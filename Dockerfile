# syntax=docker/dockerfile:1
# =============================================================================
# EduFlow — Dockerfile multi-stage (Next.js Standalone + Prisma)
# =============================================================================
# Cibles :
#   deps    → `npm ci` complet (déps production + dev : prisma, tsx…)
#   builder → `next build` → `.next/standalone`
#   migrate → conteneur d'INITIALISATION : prisma migrate deploy + seed
#             (uniquement si la base est vide, voir scripts/docker-entrypoint.sh)
#   runner  → exécution minimale en production (image finale)
#
# Utilisation docker-compose :
#   docker compose --env-file .env.docker up -d --build
# =============================================================================

ARG NODE_VERSION=22-alpine

# ---------------------------------------------------------------------------
# Étape 1 — Dépendances communes (cache de construction partagé)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Placeholders UNIQUEMENT pour le temps de l'installation : `prisma generate`
# (postinstall) lit les variables référencées par le schéma sans jamais se
# connecter à une base de données. La vraie DATABASE_URL est fournie à
# l'exécution par docker-compose.
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy?schema=public" \
    DIRECT_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Étape 2 — Compilation (standalone output)
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy?schema=public" \
    DIRECT_URL="postgresql://dummy:dummy@localhost:5432/dummy"

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate && npm run build

# ---------------------------------------------------------------------------
# Étape 3 — Initialisation de la base (migrations + seed au premier démarrage)
# ---------------------------------------------------------------------------
# Conteneur jetable utilisé par compose (`service_completed_successfully`).
# Il embarque la CLI Prisma + tsx (présents dans `node_modules` complet).
FROM node:${NODE_VERSION} AS migrate
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate \
    && chmod +x /app/scripts/docker-entrypoint.sh

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

# ---------------------------------------------------------------------------
# Étape 4 — Exécution minimale en production
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Utilisateur non-root (sécurité)
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

# Assets statiques + serveur standalone tracé par Next.js
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]