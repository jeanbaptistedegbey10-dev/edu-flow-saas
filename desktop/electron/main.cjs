"use strict";
// =============================================================================
// EduFlow Desktop — Processus principal Electron
// =============================================================================
// Wrapper Windows standalone qui embarque le serveur Next.js (Standalone) et
// un PostgreSQL privé. Cycle de vie :
//
//   1. Vérification de la licence OFFLINE (clé PUBLIQUE Ed25519 embarquée) :
//      • première exécution → fenêtre de saisie de la clé `EDU-…` ;
//      • exécutions suivantes → licence enregistrée re-vérifiée (signature) ;
//      • à chaque lancement, expiration contrôlée (payload.expiresAt) ;
//      • si la licence expire pendant une session → verrouillage.
//   2. Configuration & démarrage de PostgreSQL (binaire embarqué) ;
//   3. `prisma migrate deploy` + seed si base vide ;
//   4. Démarrage du serveur Next.js (`.next/standalone/server.js`) via
//      `ELECTRON_RUN_AS_NODE=1` (l'exécutable embarque Node.js) ;
//   5. Fenêtre Electron pointant sur http://127.0.0.1:<port>.
// =============================================================================

const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { execFile, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const { verifyLicenseKey } = require("./license-verifier.cjs");
const { loadLicense, saveLicense, clearLicense } = require("./license-store.cjs");
const { loadConfig, saveConfig } = require("./config-store.cjs");

const APP_NAME = "EduFlow Desktop";

// ---------------------------------------------------------------------------
// Clé PUBLIQUE Ed25519 de la plateforme (vérification hors-ligne).
// Fournie au build par `scripts/build-desktop.mjs` en remplaçant le marqueur
// ci-dessous ; la clé privée ne doit JAMAIS être embarquée dans l'exécutable.
// ---------------------------------------------------------------------------
const __EDUFLOW_DESKTOP_PUBLIC_KEY__ = "";

function resolvePublicKey() {
  if (process.env.EDUFLOW_DESKTOP_LICENSE_PUBLIC_KEY) {
    return process.env.EDUFLOW_DESKTOP_LICENSE_PUBLIC_KEY;
  }

  if (__EDUFLOW_DESKTOP_PUBLIC_KEY__) {
    return __EDUFLOW_DESKTOP_PUBLIC_KEY__;
  }

  // Développement : clé locale (gitignorée) `desktop/license-public-key.txt`.
  try {
    return fs
      .readFileSync(path.join(__dirname, "..", "license-public-key.txt"), "utf8")
      .trim();
  } catch {
    return "";
  }
}

const ACTIVE_PUBLIC_KEY = resolvePublicKey();

// ---------------------------------------------------------------------------
// Répertoires d'exécution du wrapper.
// ---------------------------------------------------------------------------
function webStandaloneDir() {
  return path.join(__dirname, "web-standalone");
}

function prismaToolsDir() {
  return path.join(__dirname, "prisma-tools");
}

function postgresBinDir() {
  return path.join(app.getAppPath(), "..", "postgres-embed");
}

// Sécurité anti-exécution de contenu distant : la seule charge utile servie
// est l'application locale + `data:` pour l'écran d'activation.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event, url) => {
    if (!url.startsWith("http://127.0.0.1:") && !url.startsWith("data:")) {
      event.preventDefault();
    }
  });
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});
// ---------------------------------------------------------------------------
// Pont IPC minimaliste — seulement ce que l'écran d'activation a besoin.
// ---------------------------------------------------------------------------
function registerIpcHandlers() {
  ipcMain.handle("license:get-public-key", () => ACTIVE_PUBLIC_KEY);

  ipcMain.handle("license:activate", (_event, licenseKey) => {
    const result = verifyLicenseKey(licenseKey, ACTIVE_PUBLIC_KEY);

    if (result.valid && result.payload) {
      saveLicense(app.getPath("userData"), {
        key: String(licenseKey).trim(),
        payload: result.payload,
        activatedAt: new Date().toISOString(),
      });
    }

    return result;
  });

    ipcMain.handle("diagnostics:info", () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    userData: app.getPath("userData"),
    postgresBinExists:
      fs.existsSync(path.join(postgresBinDir(), "bin", "pg_ctl.exe")) ||
      fs.existsSync(path.join(postgresBinDir(), "bin", "pg_ctl")),
    webStandaloneExists: fs.existsSync(path.join(webStandaloneDir(), "server.js")),
  }));

  // -----------------------------------------------------------------------
  // Démarrage effectif APRÈS une activation réussie depuis la fenêtre
  // d'activation (renderer → ipc : "license:start"). Le main process rouvre
  // la licence enregistrée, ferme la fenêtre d'activation et lance le runtime.
  // -----------------------------------------------------------------------
  ipcMain.handle("license:start", async () => {
    try {
      if (activationWin) {
        try {
          activationWin.close();
        } catch {
          // déjà fermée
        }
        activationWin = null;
      }

      const licenseState = checkStoredLicense();

      if (!licenseState.ok) {
        dialog.showErrorBox(
          APP_NAME,
          `Licence invalide après activation (raison : ${licenseState.reason}). ` +
            "L'application ne peut pas démarrer."
        );
        app.quit();
        return { started: false };
      }

      await startRuntime(licenseState);
      return { started: true };
    } catch (error) {
      dialog.showErrorBox(
        `${APP_NAME} — Démarrage impossible`,
        String((error && error.message) || error)
      );
      app.quit();
      return { started: false };
    }
  });
}
// ---------------------------------------------------------------------------
// Contrôles de licence (premier démarrage / redémarrage / expiration)
// ---------------------------------------------------------------------------

/** Licence enregistrée (payload mis en cache pour éviter les lectures disque). */
let cachedLicenseState = null;

function getCachedLicense() {
  try {
    return cachedLicenseState || loadLicense(app.getPath("userData"));
  } catch {
    return null;
  }
}

/**
 * Vérifie la licence enregistrée (ou l'absence de licence).
 * @returns {{ok:true, payload:object, expiresAt:Date} | {ok:false, reason:string}}
 */
function checkStoredLicense() {
  const stored = getCachedLicense();

  if (!stored) {
    return { ok: false, reason: "NO_LICENSE" };
  }

  const result = verifyLicenseKey(stored.key, ACTIVE_PUBLIC_KEY);

  if (result.valid && result.payload) {
    cachedLicenseState = {
      key: stored.key,
      payload: result.payload,
      expiresAt: result.expiresAt,
    };
    return { ok: true, payload: result.payload, expiresAt: result.expiresAt };
  }

  return { ok: false, reason: result.reason || "INVALID_SIGNATURE" };
}

/** Fenêtre de blocage pré-expiration : 5 minutes avant la fin. */
const EXPIRY_LOCK_ADVANCE_MS = 5 * 60 * 1000;

/**
 * Programme le verrouillage à (expiration − 5 min). `onExpire` est déclenché
 * une seule fois ; le processus de fermeture est ensuite irréversible.
 */
function scheduleExpiryLock(expiresAt, onExpire) {
  const now = Date.now();
  const remaining = new Date(expiresAt).getTime() - now - EXPIRY_LOCK_ADVANCE_MS;

  if (remaining > 0) {
    setTimeout(onExpire, remaining);
  } else if (remaining <= 0 && new Date(expiresAt).getTime() > now) {
    // Expiration imminente (moins de 5 min) : verrouillage immédiat.
    setTimeout(onExpire, 0);
  }
}

// ---------------------------------------------------------------------------
// Migrations Prisma + seed (outils empaquetés dans prisma-tools/)
// ---------------------------------------------------------------------------
// Le runtime desktop embarque :
//   - le package `prisma` (CLI) copié dans prisma-tools/prisma ;
//   - @prisma/client dans prisma-tools/node_modules/@prisma/client ;
//   - prisma-tools/seed-check.cjs (détecte une base vide) ;
//   - prisma-tools/seed.js (seed compilé depuis prisma/seed.ts).
// ---------------------------------------------------------------------------

/** Lance une commande en processus-fils, reject en cas d'échec. */
function spawnAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      windowsHide: true,
      stdio: "inherit",
      ...options,
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve(0);
      } else {
        reject(
          new Error(
            `Command failed (${code ?? signal}): ${file} ${args.join(" ")}`
          )
        );
      }
    });
    child.on("error", reject);
  });
}

/** Chemin du binaire Prisma CLI empaqueté (sinon fallback global `prisma`). */
function resolvePrismaEntry() {
  const tools = prismaToolsDir();
  const packaged = path.join(tools, "prisma", "build", "index.js");

  if (fs.existsSync(packaged)) {
    return { type: "node", args: [packaged] };
  }

  return { type: "global", args: [] };
}

/**
 * Démarre `prisma migrate deploy` puis le seed si la base est vide.
 * @param {object} config  Configuration persistante (contient DATABASE_URL).
 */
async function runPrismaInit(config) {
  const env = {
    ...process.env,
    DATABASE_URL: config.directUrl || config.databaseUrl,
    DIRECT_URL: config.directUrl || config.databaseUrl,
    NODE_ENV: "production",
  };

  const { type, args: cliArgs } = resolvePrismaEntry();
  const runner = type === "node" ? process.execPath : "prisma";
  const baseArgs = type === "node" ? cliArgs : [];

  // 1. Migrations (idempotent).
  console.log("[desktop:init] Application des migrations Prisma (migrate deploy)…");
  await spawnAsync(runner, [...baseArgs, "migrate", "deploy"], { env });

  // 2. Seed uniquement si la base est vide (premier démarrage).
  const checker = path.join(prismaToolsDir(), "seed-check.cjs");

  let isEmpty = true;
  if (fs.existsSync(checker)) {
    try {
      await spawnAsync(process.execPath, [checker], {
        env: { ...env, NODE_PATH: path.join(prismaToolsDir(), "node_modules") },
      });
      isEmpty = true; // exit 0 → base vide
    } catch {
      isEmpty = false; // exit ≠ 0 → des données existent
    }
  }

  if (isEmpty) {
    const seedScript = path.join(prismaToolsDir(), "seed.js");
    if (fs.existsSync(seedScript)) {
      console.log("[desktop:init] Base vide — exécution du seed de démarrage…");
      await spawnAsync(process.execPath, [seedScript], { env });
    } else {
      console.warn(
        "[desktop:init] Script seed.js introuvant — le seed est ignoré. " +
          "Regénérez l'exécutable avec `npm run build:desktop`."
      );
    }
  } else {
    console.log("[desktop:init] Des données existent déjà — seed ignoré.");
  }
}

// ---------------------------------------------------------------------------
// Démarrage du serveur Next.js standalone (électron = Node.js)
// ---------------------------------------------------------------------------
function startWebServer(env, port) {
  return new Promise((resolve, reject) => {
    const serverScript = path.join(webStandaloneDir(), "server.js");

    if (!fs.existsSync(serverScript)) {
      reject(new Error(`Serveur web introuvable : ${serverScript}`));
      return;
    }

    // ELECTRON_RUN_AS_NODE=1 : l'exécutable electron.exe se comporte comme
    // node.exe — indispensable pour exécuter server.js (Node) sans embarquer
    // un second runtime.
    const child = spawn(process.execPath, [serverScript], {
      env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let settled = false;

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      if (!settled && /started server|ready|listening/i.test(text)) {
        settled = true;
        resolve(child);
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      if (/error|failed/i.test(text)) {
        console.error("[web]", text.trim());
      }
    });

    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        reject(
          new Error(`Serveur web arrêté avant démarrage (code ${code}).`)
        );
      }
    });

    // Repli : si le serveur a démarré sans log décelable, on le considère actif
    // après 2,5 s en l'absence d'erreur, puis on vérifie l'écoute HTTP.
    setTimeout(async () => {
      if (!settled) {
        settled = true;
        if (child.exitCode !== null) {
          reject(new Error(`Serveur web arrêté (code ${child.exitCode}).`));
          return;
        }
        if (await isPortOpen(port)) {
          resolve(child);
        } else {
          reject(
            new Error(`Le serveur web n'écoute pas sur le port ${port}.`)
          );
        }
      }
    }, 2500);
  });
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const req = require("http").request(
      { host: "127.0.0.1", port, path: "/", timeout: 800 },
      (res) => resolve(true)
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => req.destroy());
    req.end();
  });
}
// ---------------------------------------------------------------------------
// Écran d'activation (saisie de la clé EDU-…)
// ---------------------------------------------------------------------------
function activationWindowHtml() {
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>${APP_NAME} — Activation</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100vh; display: flex; align-items: center;
        justify-content: center; background: linear-gradient(135deg,#0f172a,#1e293b);
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #e2e8f0;
      }
      .card { width: 560px; max-width: 92vw; padding: 32px; border-radius: 16px;
        background: #1e293b; border: 1px solid #334155;
        box-shadow: 0 20px 60px rgba(0,0,0,.45); }
      h1 { font-size: 20px; margin: 0 0 6px; }
      p  { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 4px 0 18px; }
      label { display: block; font-size: 13px; margin-bottom: 8px; color: #cbd5e1; }
      input { width: 100%; padding: 12px 14px; border-radius: 10px; font-size: 15px;
        border: 1px solid #475569; background: #0f172a; color: #f1f5f9;
        font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }
      button { width: 100%; margin-top: 16px; padding: 12px; border-radius: 10px;
        border: none; background: #22c55e; color: #052e16; font-size: 15px;
        font-weight: 700; cursor: pointer; }
      button:disabled { opacity: .6; cursor: wait; }
      .error { color: #f87171; font-size: 13px; margin-top: 12px; display: none;
        white-space: pre-line; }
      .meta { margin-top: 18px; font-size: 11px; color: #64748b; line-height: 1.7; }
      code { color: #a5b4fc; }
      .badge { font-size: 11px; color: #fbbf24; background:#451a03;
        border:1px solid #b45309; padding: 2px 8px; border-radius: 999px;
        display:inline-block; margin-bottom:12px; }
    </style>
  </head>
  <body>
    <div class="card">
      <span class="badge">OFFLINE — aucune connexion requise</span>
      <h1>Activation de votre licence</h1>
      <p>Collez la clé <code>EDU-…</code> fournie par votre revendeur ou par la
        plateforme EduFlow (facture / e-mail de livraison).</p>
      <label for="licenseKey">Clé de licence</label>
      <input id="licenseKey" placeholder="EDU-XXXXX-XXXXX-XXXXX-…-CCCC"
             autocomplete="off" autocorrect="off" spellcheck="false" />
      <button id="activate">Activer et démarrer</button>
      <div id="error" class="error"></div>
      <div id="meta" class="meta">Chargement…</div>
    </div>
    <script>
      const { ipcRenderer } = require("electron");

      async function refreshMeta() {
        const info = await ipcRenderer.invoke("diagnostics:info");
        document.getElementById("meta").textContent =
          "Version " + info.version + " — " + info.platform + "/" + info.arch + "\\n" +
          "PostgreSQL embarqué : " + (info.postgresBinExists ? "OK" : "ABSENT") + "\\n" +
          "Serveur Web empaqueté : " + (info.webStandaloneExists ? "OK" : "ABSENT");
      }

      function mapError(reason) {
        const messages = {
          MALFORMED: "Format de clé méconnaissable. Vérifiez la saisie (ex : EDU-XXXXX-…).",
          CHECKSUM_INVALID: "Erreur de frappe détectée : la clé est incomplète ou erronée.",
          INVALID_PAYLOAD: "Contenu de la clé illisible ou corrompu.",
          INVALID_SIGNATURE: "Signature invalide : cette clé n'a pas été émise par EduFlow.",
          EXPIRED: "Cette clé de licence a expiré. Contactez le support.",
          PUBLIC_KEY_INVALID: "L'exécutable ne contient pas de clé publique valide.",
        };
        return messages[reason] || "Clé de licence invalide.";
      }

      document.getElementById("activate").addEventListener("click", async () => {
        const btn = document.getElementById("activate");
        const err = document.getElementById("error");
        btn.disabled = true; err.style.display = "none";
        try {
          const key = document.getElementById("licenseKey").value.trim();
          if (!key) throw new Error("Veuillez saisir une clé de licence.");
          const result = await ipcRenderer.invoke("license:activate", key);
          if (result.valid) {
            const ex = result.payload.expiresAt
              ? new Date(result.payload.expiresAt).toLocaleDateString("fr-FR")
              : "perpétuelle";
            err.style.color = "#4ade80";
            err.style.display = "block";
            err.textContent =
              "Licence valide — lancement de l'application (expiration : " + ex + ")…";
                                    setTimeout(() => ipcRenderer.invoke("license:start"), 900);
            btn.disabled = true;
          } else {
            throw new Error(mapError(result.reason));
          }
        } catch (e) {
          err.style.color = "#f87171";
          err.style.display = "block";
          err.textContent = e.message || "Erreur d'activation.";
          btn.disabled = false;
        }
      });

      refreshMeta();
    <\/script>
  </body>
</html>`;
}

function openActivationWindow() {
  const win = new BrowserWindow({
    width: 700,
    height: 600,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: `${APP_NAME} — Activation`,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  activationWin = win;

  win.removeMenu();
  win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(activationWindowHtml()));

  // Nettoyage de la référence si la fenêtre est fermée manuellement.
  win.on("closed", () => {
    if (activationWin === win) {
      activationWin = null;
    }
  });

  return win;
}

let postgresManager = null;
let isShuttingDown = false;
let activationWin = null;

function isLicenseMissingOrInvalid() {
  return ACTIVE_PUBLIC_KEY === "";
}

// ---------------------------------------------------------------------------
// Démarrage applicatif
// ---------------------------------------------------------------------------
async function boot() {
  registerIpcHandlers();

  if (isLicenseMissingOrInvalid()) {
    dialog.showErrorBox(
      APP_NAME,
      "Aucune clé publique de licence n'est embarquée dans cet exécutable. " +
        "L'installation est incomplète (contactez le support)."
    );
    app.quit();
    return;
  }

  const licenseState = checkStoredLicense();

  if (!licenseState.ok) {
    // Première exécution OU licence expirée/invalide → exiger une clé valide.
    openActivationWindow();
    return;
  }

  try {
    await startRuntime(licenseState);
  } catch (error) {
    dialog.showErrorBox(
      `${APP_NAME} — Démarrage impossible`,
      String((error && error.message) || error)
    );
    app.quit();
  }
}

async function startRuntime(licenseState) {
  const userDataPath = app.getPath("userData");
  let config = loadConfig(userDataPath);

  // Première exécution « configurée » : PostgreSQL embarqué + AUTH_SECRET
  // aléatoire stable (généré par saveConfig) — aucune saisie utilisateur.
  if (!config) {
    const { buildEmbeddedDatabaseUrl, DEFAULT_PORT } = require("./config-store.cjs");
    const postgresPort = 55432;
    config = saveConfig(userDataPath, {
      databaseUrl: buildEmbeddedDatabaseUrl(postgresPort),
      port: DEFAULT_PORT,
      postgresPort,
    });
  }

  // Référence pour l'arrêt propre (lockUntilRenewal).
  configRefValue = config;

  // 1. PostgreSQL (embarqué — ou serveur local distant déjà actif).
  postgresManager = require("./postgres-manager.cjs");
  await postgresManager.ensureRunning(config, app);

  // 2. Migrations + seed si base vide (outils Prisma empaquetés).
  await runPrismaInit(config);

  // 3. Serveur Next.js standalone.
  const env = {
    NODE_ENV: "production",
    PORT: String(config.port),
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: config.databaseUrl,
    DIRECT_URL: config.directUrl || config.databaseUrl,
    AUTH_SECRET: config.authSecret,
    AUTH_TRUST_HOST: "true",
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${config.port}`,
    LICENSE_PUBLIC_KEY: ACTIVE_PUBLIC_KEY,
    PAYMENT_SANDBOX: "true",
    PAYMENT_PROVIDER: "kkiapay",
    PAYMENT_PUBLIC_KEY: "",
    PAYMENT_SECRET_KEY: "",
    PAYMENT_WEBHOOK_SECRET: "",
  };

  const webChild = await startWebServer(env, config.port);

  // 4. Fenêtre principale.
  const mainWin = new BrowserWindow({
    width: 1440,
    height: 900,
    title: `${APP_NAME} — Console`,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });

  mainWin.removeMenu();
  await mainWin.loadURL(`http://127.0.0.1:${config.port}`);

  // 5. Verrouillage 5 minutes avant l'expiration de la licence.
  scheduleExpiryLock(licenseState.expiresAt, () => {
    lockUntilRenewal(mainWin, webChild);
  });

  // 6. Arrêt propre : fermeture de la fenêtre ou sortie du serveur web.
  mainWin.on("closed", () => app.quit());
  webChild.on("exit", (code) => {
    if (!isShuttingDown) {
      console.error(`[web] Serveur arrêté (code ${code}).`);
      app.quit();
    }
  });
}

async function lockUntilRenewal(mainWin, webChild) {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  dialog.showMessageBoxSync(mainWin, {
    type: "warning",
    title: "Licence expirée",
    message:
      "Votre licence EduFlow est arrivée à expiration (ou expire dans moins de " +
      "5 minutes). L'application se verrouille : contactez votre revendeur pour " +
      "obtenir un renouvellement.",
  });

  try {
    if (webChild && !webChild.killed) {
      webChild.kill();
    }
    if (postgresManager) {
      await postgresManager.stop(configRef(), app);
    }
  } catch {
    // Arrêt déjà en cours.
  }

  // Exigence d'une NOUVELLE clé au prochain démarrage.
  clearLicense(app.getPath("userData"));
  app.quit();
}

// Référence de configuration conservée pour le gestionnaire PostgreSQL.
let configRefValue = null;
function configRef() {
  return configRefValue;
}

module.exports = {};