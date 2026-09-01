"use strict";
// =============================================================================
// EduFlow Desktop — Configuration persistante (`userData/config.json`)
// =============================================================================
// Contient la connexion PostgreSQL, le port de l'application et le secret de
// session (AUTH_SECRET) généré au premier lancement pour des sessions stables.
// =============================================================================

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Port de l'application web locale (évite 3000, souvent déjà utilisé).
const DEFAULT_PORT = 3210;

// Port interne de PostgreSQL **embarqué** : volontairement hors des plages
// courantes (5432) pour ne pas entrer en conflit avec un serveur PostgreSQL
// déjà installé sur la machine du client.
const DEFAULT_POSTGRES_PORT = 55432;

function configFilePath(userDataPath) {
  return path.join(userDataPath, "config.json");
}

/** Retourne la configuration enregistrée (`null` si absente). */
function loadConfig(userDataPath) {
  try {
    const raw = fs.readFileSync(configFilePath(userDataPath), "utf8");
    const parsed = JSON.parse(raw);

    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Absent ou corrompu → première exécution.
  }

  return null;
}
/**
 * Enregistre la configuration.
 * @param {string} userDataPath
 * @param {object} patch
 *   { databaseUrl?, directUrl?, port?, postgresPort?, authSecret? }
 * @returns {object} configuration complète persistée.
 */
function saveConfig(userDataPath, patch) {
  const previous = loadConfig(userDataPath) ?? {};

  const next = {
    databaseUrl:
      typeof patch.databaseUrl === "string" && patch.databaseUrl.trim()
        ? patch.databaseUrl.trim()
        : previous.databaseUrl,
    directUrl:
      typeof patch.directUrl === "string" && patch.directUrl.trim()
        ? patch.directUrl.trim()
        : typeof patch.databaseUrl === "string" && patch.databaseUrl.trim()
          ? patch.databaseUrl.trim()
          : previous.directUrl,
    port: Number.isInteger(patch.port)
      ? Math.max(1024, Math.min(65535, patch.port))
      : Number.isInteger(previous.port)
        ? previous.port
        : DEFAULT_PORT,
    postgresPort: Number.isInteger(patch.postgresPort)
      ? Math.max(1024, Math.min(65535, patch.postgresPort))
      : Number.isInteger(previous.postgresPort)
        ? previous.postgresPort
        : DEFAULT_POSTGRES_PORT,
    authSecret:
      typeof patch.authSecret === "string" && patch.authSecret
        ? patch.authSecret
        : typeof previous.authSecret === "string" && previous.authSecret
          ? previous.authSecret
          : crypto.randomBytes(32).toString("hex"),
    createdAt: previous.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(
    configFilePath(userDataPath),
    JSON.stringify(next, null, 2),
    "utf8"
  );

  return next;
}

/**
 * Construit la DATABASE_URL standard de la base embarquée.
 * @returns {string}
 */
function buildEmbeddedDatabaseUrl(postgresPort) {
  const port = Number.isInteger(postgresPort)
    ? postgresPort
    : DEFAULT_POSTGRES_PORT;
  return `postgresql://eduflow:eduflow@127.0.0.1:${port}/eduflow?schema=public`;
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_POSTGRES_PORT,
  buildEmbeddedDatabaseUrl,
  loadConfig,
  saveConfig,
};