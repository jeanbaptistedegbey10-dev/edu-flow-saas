#!/usr/bin/env bash
# =============================================================================
# EduFlow — Script d'installation express (Self-Hosted / Docker)
# =============================================================================
# Automatise :
#   1. La vérification de Docker + docker compose ;
#   2. La création du fichier .env.docker (à partir de .env.docker.example) ;
#   3. Le build + le démarrage de la stack (`docker compose up -d --build`).
#
# Usage :  bash scripts/setup-self-hosted.sh   (ou curl … | bash)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="$ROOT/.env.docker"
EXAMPLE_FILE="$ROOT/.env.docker.example"

log() { printf '\033[1;34m[eduflow:setup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[eduflow:setup]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[eduflow:setup]\033[0m %s\n' "$*" >&2; }

# ---------------------------------------------------------------------------
# 1. Vérifications préliminaires
# ---------------------------------------------------------------------------
log "Vérification de Docker…"
if ! command -v docker >/dev/null 2>&1; then
  err "Docker n'est pas installé. Installez-le depuis https://docker.com et relancez."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  err "Docker ne répond pas (le service est-il démarré ?)."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  err "docker compose est introuvable (Docker 24.0+ requis)."
  exit 1
fi

log "Docker $(docker --version) ✅"

# ---------------------------------------------------------------------------
# 2. Fichier de configuration .env.docker
# ---------------------------------------------------------------------------
if [ -f "$ENV_FILE" ]; then
  warn "Un fichier .env.docker existe déjà — il ne sera PAS écrasé."
else
  if [ ! -f "$EXAMPLE_FILE" ]; then
    err "Modèle .env.docker.example introuvant."
    exit 1
  fi

  cp "$EXAMPLE_FILE" "$ENV_FILE"
  log "Modèle copié → .env.docker"
fi

# Génération des secrets critiques si non renseignés / valeurs par défaut.
if grep -q "CHANGEZ_MOI_MOT_DE_PASSE_FORT" "$ENV_FILE"; then
  NEW_PG=$(openssl rand -base64 18 2>/dev/null || tr -dc 'A-Za-z0-9' </dev/urandom | head -c 18)
  sed -i.bak "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$NEW_PG/" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  log "Mot de passe PostgreSQL généré aléatoirement."
fi

if grep -q "CHANGEZ_MOI_AUTH_SECRET_64_HEX" "$ENV_FILE"; then
  NEW_SECRET=$(openssl rand -hex 32 2>/dev/null || tr -dc 'a-f0-9' </dev/urandom | head -c 64)
  sed -i.bak "s/AUTH_SECRET=.*/AUTH_SECRET=$NEW_SECRET/" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  log "AUTH_SECRET généré aléatoirement."
fi

echo
warn "🔐 Éditez maintenant .env.docker pour renseigner :"
warn "   - LICENSE_PUBLIC_KEY   (clé Ed25519 de votre plateforme EduFlow)"
warn "   - NEXT_PUBLIC_APP_URL  (URL publique http://<ip>:3000)"
warn "Puis appuyez sur Entrée pour continuer."
read -r _

# ---------------------------------------------------------------------------
# 3. Build + démarrage de la stack
# ---------------------------------------------------------------------------
log "Construction et démarrage de la stack (docker compose up -d --build)…"
docker compose --env-file "$ENV_FILE" up -d --build

echo
log "✅ EduFlow est en ligne. Services :"
docker compose --env-file "$ENV_FILE" ps

echo
log "🔗 Accédez à l'application : http://localhost:$(grep -E '^APP_PORT=' "$ENV_FILE" | cut -d= -f2)"
log "📖 Documentation complète : docs/SELF_HOSTED.md"
