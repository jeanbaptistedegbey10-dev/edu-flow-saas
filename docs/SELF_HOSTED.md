# EduFlow — Self-Hosted (On-Premise)

Ce guide décrit l'installation d'**EduFlow** sur le serveur d'un client, de
façon totalement autonome : pas de dépendance au cloud, la base de données et
l'application s'exécutent localement via Docker.

> ℹ️ Une variante **exécutable Windows standalone** (hors-ligne, sans Docker,
> avec PostgreSQL embarqué) est décrite en §8.

---

## 1. Prérequis

| Outil        | Version minimale                          |
| ------------ | ----------------------------------------- |
| Docker       | 24.0+ (avec `docker compose` intégré)     |
| Mémoire      | 2 Go de RAM (4 Go recommandés)            |
| Disque       | 1 Go d'espace libre (images + base)       |
| Accès réseau | Un port exposé (défaut `:3000`)           |

---

## 2. Installation (méthode express)

Deux scripts automatisent l'installation :

```bash
# Linux / macOS — depuis le dossier du code source
bash scripts/setup-self-hosted.sh
```

```bat
:: Windows — depuis le dossier du code source (Invite de commandes / PowerShell)
scripts\setup-self-hosted.bat
```

Le script :

1. Vérifie que Docker (et `docker compose`) est installé et démarré ;
2. Copie `.env.docker.example` → `.env.docker` ;
3. Génère les secrets manquants (mot de passe PostgreSQL, `AUTH_SECRET`) ;
4. Vous invite à renseigner la clé publique de licence et l'URL publique ;
5. Lance `docker compose --env-file .env.docker up -d --build`.

---

## 3. Installation manuelle

### 3.1 Récupérer le code source

```bash
git clone https://github.com/<owner>/eduflow.git
cd eduflow
```

### 3.2 Configurer l'environnement

```bash
cp .env.docker.example .env.docker
```

Éditez `.env.docker` et renseignez au minimum :

| Variable              | Valeur attendue                                          |
| --------------------- | -------------------------------------------------------- |
| `POSTGRES_PASSWORD`   | Mot de passe fort (`openssl rand -base64 18`)            |
| `AUTH_SECRET`         | Secret de sessions (`openssl rand -hex 32`)             |
| `LICENSE_PUBLIC_KEY`  | Clé publique Ed25519 (voir §4)                          |
| `NEXT_PUBLIC_APP_URL` | URL publique (ex. `http://192.168.1.50:3000`)            |
| `APP_PORT`            | Port exposé (optionnel, défaut `3000`)                   |

> ⚠️ `.env.docker` contient des **secrets**. Restreignez ses accès
> (`chmod 600`). Ne déployez **jamais** `LICENSE_PRIVATE_KEY` sur une instance
> cliente.

### 3.3 Démarrer la stack

```bash
docker compose --env-file .env.docker up -d --build
```

---

## 4. Clé de licence Ed25519 (hors-ligne)

EduFlow valide les clés de licence **sans aucun appel réseau**, grâce à une
paire de clés Ed25519.

### 4.1 Générer un couple de clés (Super-Admin)

Sur le serveur d'administration uniquement :

```bash
npm run license:keygen -- --keygen
```

Le script génère :

- `LICENSE_PRIVATE_KEY` — **conservée sur le serveur Super-Admin uniquement** ;
- `LICENSE_PUBLIC_KEY` — déployée sur chaque instance cliente.

### 4.2 Émettre une clé de licence

Depuis le back-office `/super-admin`, le générateur signe un *payload* avec
`LICENSE_PRIVATE_KEY` :

```json
{
  "organizationId": "org-123",
  "planType": "SELF_HOSTED",
  "expiresAt": "2027-01-01T00:00:00.000Z"
}
```

La clé émise a le format humain `EDU-XXXXX-XXXXX-…-CCCC` (Base32, avec checksum
de détection d'erreur de frappe).

### 4.3 Activer l'instance cliente

- **Docker / Self-Hosted** : renseignez `LICENSE_PUBLIC_KEY` dans `.env.docker`
  (voir §3.2).
- **Desktop (Windows offline)** : la clé publique est embarquée dans
  l'exécutable au build (`scripts/build-desktop.mjs`). La clé privée ne quitte
  jamais le serveur d'administration.

---

## 5. Gestion de la base de données

### 5.1 Migrations & seed

La stack dispose d'un service `migrate` jetable (`restart: "no"`) qui, au
premier démarrage :

1. Attend que PostgreSQL soit prêt (`scripts/docker-init-wait.mjs`) ;
2. Applique les migrations (`prisma migrate deploy`) ;
3. Exécute le **seed** uniquement si la base est vide
   (`scripts/docker-seed-check.mjs`) — jamais d'écrasement des données existantes.

Le service `web` dépend de `migrate` via
`condition: service_completed_successfully` : il ne démarre qu'après une
initialisation réussie.

### 5.2 Comptes de démonstration

Le seed crée un compte d'administration :

| Compte                            | Rôle        | Mot de passe  |
| --------------------------------- | ----------- | ------------- |
| `superadmin@eduflow.app`          | SUPER_ADMIN | `password123` |
| `admin@excellence-formation.com`  | ADMIN       | `password123` |
| `teacher@excellence-formation.com`| TEACHER     | `password123` |
| `staff@excellence-formation.com`  | STAFF       | `password123` |

---

## 6. Maintenance courante

```bash
# Redémarrer l'application (sans rebuild)
docker compose --env-file .env.docker up -d

# Appliquer une nouvelle migration après évolution du schéma Prisma
docker compose --env-file .env.docker exec web npx prisma migrate deploy

# Vérifier l'état des services
docker compose ps

# Arrêter complètement (attention: détruit le volume de la base)
docker compose --env-file .env.docker down -v
```

---

## 7. Sauvegarde de la base

```bash
docker compose --env-file .env.docker exec db pg_dump -U eduflow eduflow > sauvegarde.sql
```

---

## 8. Exécutable Windows Offline (Desktop)

Variante **hors-ligne** : un `.exe` (installateur NSIS ou portable) embarquant
le serveur Next.js **standalone** et un PostgreSQL **embarqué** — aucune
installation préalable sur la machine cliente.

### 8.1 Prérequis de build (Windows)

1. Node.js 22+ (et npm) ;
2. PostgreSQL embarqué dans `desktop/resources/postgres-embed/bin/`
   (fourni par le support ou [pglayout/pg_windows](https://github.com/pglayout/pg_windows)) ;
3. La clé publique `LICENSE_PUBLIC_KEY` (définie dans `.env` ou l'environnement).

### 8.2 Packaging

```bash
# 1. Générer un couple de clés (si pas déjà fait)
npm run license:keygen -- --keygen --out .env.licensing

# 2. Vérifier la compatibilité Desktop ↔ serveur (recommandé)
npm run check:license:desktop

# 3. Construire l'exécutable
npm run build:desktop
```

Production dans `desktop/release/` :

| Artefact                                  | Type              |
| ----------------------------------------- | ----------------- |
| `EduFlow Desktop Setup <v>.exe`           | Installateur NSIS |
| `EduFlow-Desktop-Portable-<v>.exe` | Portable          |

### 8.3 Cycle de vie (offline)

À chaque démarrage :

1. **Vérification de la licence hors-ligne** (clé Ed25519 embarquée) :
   - première exécution → fenêtre de saisie de la clé `EDU-…` ;
   - exécutions suivantes → licence re-vérifiée (signature + expiration) ;
   - expiration **pendant** une session → verrouillage 5 min avant fin.
2. Démarrage du PostgreSQL privé (écoute `127.0.0.1` uniquement) ;
3. `prisma migrate deploy` + seed si base vide ;
4. Démarrage du serveur Next.js standalone ;
5. Fenêtre principale sur `http://127.0.0.1:<port>`.`

Aucune donnée n'est transmise au-delà de la machine cliente.

---

## 9. Dépannage

| Symptom                                  | Cause / solution                                    |
| ----------------------------------------- | ------------------------------------------------- |
| `port 3000 already in use`               | Changez `APP_PORT` dans `.env.docker`            |
| `AUTH_SECRET est requis`                 | Renseignez `AUTH_SECRET` dans `.env.docker`  |
| `PostgreSQL non joignable`              | `docker compose ps` : `db` doit être `healthy` |
| Erreur de migration                        | `docker compose exec migrate npx prisma migrate deploy` |
| Licence invalide sur Desktop             | Vérifiez que la clé publique embarquée = votre plateforme |
