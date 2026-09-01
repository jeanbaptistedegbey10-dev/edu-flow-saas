"use strict";
// =============================================================================
// EduFlow Desktop — Gestion du PostgreSQL EMBARQUÉ
// =============================================================================
// Démarre/arrête un PostgreSQL fourni AVEC l'exécutable (répertoire
// `resources/postgres-embed`), dans un répertoire de données dédié sous
// `userData/postgres` :
//
//   1. `initdb`  → crée le cluster (une seule fois) ;
//   2. `pg_ctl start` → démarre le serveur local 127.0.0.1:<postgresPort> ;
//   3. creation de la base `eduflow` et du rôle `eduflow` au premier boot ;
//   4. `pg_ctl stop` → arrêt propre à la fermeture de l'application.
//
// Le mot de passe par défaut (`eduflow`) ne protège QUE le port local
// 127.0.0.1 de la machine cliente : aucune exposition réseau.
// =============================================================================

const { execFile } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");

const PG_USER = "eduflow";
const PG_PASSWORD = "eduflow";
const PG_DB = "eduflow";

// En dev : postgres embarqué depuis `<racine>/desktop/postgres-runtime`.
// En paquet : `<install>/resources/postgres-embed`.
function resolvePostgresRoot(app) {
  const candidates = [
    path.join(app.getAppPath(), "..", "postgres-embed"), // packaged (app.asar → resources/)
    path.join(__dirname, "..", "postgres-embed"), // packaged alternatif
    path.join(__dirname, "..", "..", "desktop", "postgres-runtime"), // dev
    path.join(__dirname, "..", "postgres-runtime"), // dev alternatif
  ];

  for (const candidate of candidates) {
    if (
      fs.existsSync(path.join(candidate, "bin", "initdb.exe")) ||
      fs.existsSync(path.join(candidate, "bin", "initdb"))
    ) {
      return candidate;
    }
  }

  return null;
}

function execFileAsync(file, args, options) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { ...options, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        error._stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function waitForPostgres(port, maxAttempts = 40, delayMs = 500) {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryConnect = () => {
      attempt += 1;
      const socket = new net.Socket();
      const cleanup = () => socket.destroy();
      socket.setTimeout(delayMs);
      socket.once("connect", () => {
        cleanup();
        resolve(true);
      });
      socket.once("error", () => {
        cleanup();
        if (attempt >= maxAttempts) {
          reject(new Error(`PostgreSQL non joignable sur 127.0.0.1:${port}.`));
          return;
        }
        setTimeout(tryConnect, delayMs);
      });
      socket.once("timeout", () => {
        cleanup();
        if (attempt >= maxAttempts) {
          reject(new Error(`PostgreSQL non joignable sur 127.0.0.1:${port}.`));
          return;
        }
        setTimeout(tryConnect, delayMs);
      });
      socket.connect(Number(port), "127.0.0.1");
    };

    tryConnect();
  });
}
/**
 * Vérifie qu'un PostgreSQL est déjà actif sur <port> (cas d'une base distante).
 */
function isPostgresReachable(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(Number(port), "127.0.0.1");
  });
}

/**
 * Démarre l'instance PostgreSQL embarquée (ou confirme l'existence d'une
 * instance locale déjà active sur le port configuré).
 * @returns {Promise<{embedded:boolean, dataDir:string|null}>}
 */
async function ensureRunning(config, app) {
  const postgresRoot = resolvePostgresRoot(app);
  const port = config.postgresPort || 5432;

  if (!postgresRoot) {
    // Aucun binaire embarqué : on tente d'utiliser un serveur PostgreSQL
    // local déjà actif (installation système).
    if (await isPostgresReachable(port)) {
      return { embedded: false, dataDir: null };
    }
    throw new Error(
      "PostgreSQL embarqué introuvable et aucun serveur PostgreSQL actif sur " +
        `127.0.0.1:${port}. L'installation est incomplète.`
    );
  }

  const binDir = path.join(postgresRoot, "bin");
  const dataDir = path.join(
    app.getPath("userData"),
    "postgres",
    `data-${port}`
  );

  fs.mkdirSync(path.dirname(dataDir), { recursive: true });

  const isInit = fs.existsSync(path.join(dataDir, "PG_VERSION"));

  if (!isInit) {
    await execFileAsync(path.join(binDir, "initdb.exe"), [
      "-D",
      dataDir,
      "-U",
      PG_USER,
      "--auth=scram-sha-256",
      "--encoding=UTF8",
      "--no-locale",
    ]);
  }

  // Autoriser localement par mot de passe (scram) sur 127.0.0.1 uniquement.
  const pgHba = path.join(dataDir, "pg_hba.conf");
  const hbaContent = [
    "# EduFlow — pg_hba.conf local (127.0.0.1 UNIQUEMENT)",
    "local   all             all                                     trust",
    "host    all             all             127.0.0.1/32            scram-sha-256",
    "host    all             all             ::1/128                 scram-sha-256",
  ].join("\n");
  fs.writeFileSync(pgHba, hbaContent, "utf8");

  // Port + écoute locale uniquement.
  const pgConf = path.join(dataDir, "postgresql.conf");
  let conf = fs.readFileSync(pgConf, "utf8");
  conf = conf.replace(/^#?port\s*=.*$/m, `port = ${port}`);
  conf = conf.replace(
    /^#?listen_addresses\s*=.*$/m,
    "listen_addresses = '127.0.0.1'"
  );
  fs.writeFileSync(pgConf, conf, "utf8");

  const running = await isPostgresReachable(port);

  if (!running) {
    await execFileAsync(path.join(binDir, "pg_ctl.exe"), [
      "-D",
      dataDir,
      "-l",
      path.join(dataDir, "eduflow-postgres.log"),
      "-w",
      "-t",
      "60",
      "start",
    ]);
  }

  await waitForPostgres(port);

  // Création / alignement du mot de passe (idempotent, échec toléré).
  try {
    await execFileAsync(path.join(binDir, "psql.exe"), [
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-U",
      PG_USER,
      "-d",
      "postgres",
      "-c",
      `ALTER USER "${PG_USER}" WITH PASSWORD '${PG_PASSWORD}';`,
    ]);
  } catch {
    // Rôle déjà existant : ignoré (base déjà initialisée).
  }

  try {
    await execFileAsync(path.join(binDir, "createdb.exe"), [
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-U",
      PG_USER,
      PG_DB,
    ]);
  } catch {
    // Base déjà existante → OK.
  }

  return { embedded: true, dataDir };
}

/** Arrêt propre de l'instance embarquée (ignore si serveur externe). */
async function stop(config, app) {
  const postgresRoot = resolvePostgresRoot(app);
  const port = config.postgresPort || 5432;

  if (!postgresRoot) {
    return;
  }

  const dataDir = path.join(app.getPath("userData"), "postgres", `data-${port}`);

  if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
    return;
  }

  try {
    await execFileAsync(path.join(postgresRoot, "bin", "pg_ctl.exe"), [
      "-D",
      dataDir,
      "-m",
      "fast",
      "-w",
      "-t",
      "30",
      "stop",
    ]);
  } catch {
    // Serveur déjà arrêté.
  }
}

module.exports = { ensureRunning, isPostgresReachable, stop };