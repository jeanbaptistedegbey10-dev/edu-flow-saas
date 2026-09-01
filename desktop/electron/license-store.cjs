"use strict";
// =============================================================================
// EduFlow Desktop — Stockage persistant de la licence activée
// =============================================================================
// La clé validée et son payload sont conservés dans le répertoire de données
// utilisateur (`userData/license.json`) : au redémarrage, la licence est
// re-vérifiée hors-ligne (signature + expiration) avant déblocage.
// =============================================================================

const fs = require("fs");
const path = require("path");

function licenseFilePath(userDataPath) {
  return path.join(userDataPath, "license.json");
}

/** Retourne la licence enregistrée (`null` si absent / illisible). */
function loadLicense(userDataPath) {
  try {
    const raw = fs.readFileSync(licenseFilePath(userDataPath), "utf8");
    const parsed = JSON.parse(raw);

    if (parsed && typeof parsed === "object" && typeof parsed.key === "string") {
      return parsed;
    }
  } catch {
    // Fichier absent ou corrompu → considéré comme non activé.
  }

  return null;
}

/** Enregistre une licence activée (clé + payload + date d'activation). */
function saveLicense(userDataPath, license) {
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(
    licenseFilePath(userDataPath),
    JSON.stringify(
      {
        key: license.key,
        payload: license.payload,
        activatedAt: license.activatedAt || new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
}

/** Supprime la licence enregistrée (forçage d'une nouvelle activation). */
function clearLicense(userDataPath) {
  try {
    fs.rmSync(licenseFilePath(userDataPath), { force: true });
  } catch {
    // Ignoré : rien à nettoyer.
  }
}

module.exports = { loadLicense, saveLicense, clearLicense };