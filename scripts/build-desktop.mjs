/**
 * Build Desktop — orchestre la création de l'exécutable Windows standalone
 * Electron pour EduFlow.
 *
 * Pipeline :
 *   1. Production du build Next.js « standalone » (npm run build) ;
 *   2. Assemblage du runtime desktop (server.js, static, Prisma tools) ;
 *   3. Génération de l'icône .ico et injection de la clé publique ;
 *   4. npm install des dépendances Electron (desktop/node_modules) ;
 *   5. electron-builder → desktop/release/EduFlow Desktop Setup <version>.exe
 *      (+ EduFlow-Desktop-Portable-*.exe)
 *
 * Usage :  npm run build:desktop
 *
 * Exécuté depuis la racine du workspace. Extension `.mjs` → hors-scope `tsc`.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(process.cwd());
const DESKTOP = path.join(ROOT, "desktop");
const RUNTIME = path.join(DESKTOP, "runtime");
const WEB_STANDALONE = path.join(RUNTIME, "web-standalone");
const PRISMA_TOOLS = path.join(RUNTIME, "prisma-tools");
const ELECTRON_SRC = path.join(DESKTOP, "electron");

function log(msg) {
  process.stdout.write(`[desktop:build] ${msg}\n`);
}

function exec(label, file, args, opts = {}) {
  log(`${label} → ${file} ${args.join(" ")}`);
  const res = spawnSync(file, args, {
    stdio: "inherit",
    windowsHide: true,
    ...opts,
  });
  if (res.status !== 0) {
    throw new Error(`${label} a échoué (code ${res.status})`);
  }
  return res;
}

async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else {
      await fsp.copyFile(s, d);
    }
  }
}


// ---------------------------------------------------------------------------
// Étape 1 — Production du build Next.js standalone
// ---------------------------------------------------------------------------
async function ensureNextStandalone() {
  const standalone = path.join(ROOT, ".next", "standalone");
  const staticDir = path.join(ROOT, ".next", "static");

  if (!fs.existsSync(path.join(standalone, "server.js"))) {
    log("Build Next.js introuvable — exécution de `npm run build`…");
    exec("next build", "npm", ["run", "build"], {
      cwd: ROOT,
      // `output: "standalone"` est conditionnel (voir next.config.ts) : il est
      // réservé aux cibles self-hosted (Docker / Desktop) et doit rester désactivé
      // pour Vercel, dont le packaging échoue sur ce mode (ENOENT nft.json).
      env: { ...process.env, NEXT_OUTPUT_STANDALONE: "1" },
    });
  }

  log("Copie du serveur standalone → runtime/web-standalone …");
  await fsp.rm(WEB_STANDALONE, { recursive: true, force: true });
  await copyDir(standalone, WEB_STANDALONE);

  if (fs.existsSync(staticDir)) {
    const targetStatic = path.join(WEB_STANDALONE, ".next", "static");
    log("Copie des assets statiques → runtime/web-standalone/.next/static …");
    await fsp.mkdir(path.join(WEB_STANDALONE, ".next"), { recursive: true });
    if (fs.existsSync(targetStatic)) {
      await fsp.rm(targetStatic, { recursive: true, force: true });
    }
    await copyDir(staticDir, targetStatic);
  }
}

// ---------------------------------------------------------------------------
// Étape 2 — Prisma tools (schema + client) pour migrate deploy / seed
// ---------------------------------------------------------------------------
async function ensurePrismaTools() {
  log("Assemblage des outils Prisma → runtime/prisma-tools …");
  await fsp.rm(PRISMA_TOOLS, { recursive: true, force: true });

  const schemaSrc = path.join(ROOT, "prisma", "schema.prisma");
  await fsp.mkdir(PRISMA_TOOLS, { recursive: true });
  if (fs.existsSync(schemaSrc)) {
    await fsp.copyFile(schemaSrc, path.join(PRISMA_TOOLS, "schema.prisma"));
  }

  const seedSrc = path.join(ROOT, "prisma", "seed.ts");
  if (fs.existsSync(seedSrc)) {
    await fsp.copyFile(seedSrc, path.join(PRISMA_TOOLS, "seed.ts"));
  }

  // Engine binaires Prisma (CLI) + @prisma/client généré (hors-ligne).
  const rootNodeModules = path.join(ROOT, "node_modules");
  const prismaPkg = path.join(rootNodeModules, "prisma");
  if (fs.existsSync(prismaPkg)) {
    await copyDir(prismaPkg, path.join(PRISMA_TOOLS, "prisma"));
  }

  // @prisma/client + bcryptjs (dépendances du seed/compilé) résolus depuis
  // prisma-tools/node_modules/ → `require("@prisma/client")` & `require("bcryptjs")`.
  const nmTarget = path.join(PRISMA_TOOLS, "node_modules");
  const prismaClient = path.join(rootNodeModules, "@prisma", "client");
  if (fs.existsSync(prismaClient)) {
    const clientTarget = path.join(nmTarget, "@prisma", "client");
    await fsp.mkdir(path.dirname(clientTarget), { recursive: true });
    await copyDir(prismaClient, clientTarget);
  }
  const bcryptPkg = path.join(rootNodeModules, "bcryptjs");
  if (fs.existsSync(bcryptPkg)) {
    await copyDir(bcryptPkg, path.join(nmTarget, "bcryptjs"));
  }

  // seed-check.cjs embarqué (détecte une base vide au lancement).
  const seedCheckSrc = path.join(ELECTRON_SRC, "seed-check.cjs");
  if (fs.existsSync(seedCheckSrc)) {
    await fsp.copyFile(seedCheckSrc, path.join(PRISMA_TOOLS, "seed-check.cjs"));
  }
}

// ---------------------------------------------------------------------------
// Étape 2.bis — Compilation du seed TypeScript → JavaScript (hors-ligne)
// ---------------------------------------------------------------------------
// Le seed (`prisma/seed.ts`) est compilé en CommonJS (`prisma-tools/seed.js`)
// afin d'être exécutable par `node` dans l'exécutable Desktop, sans dépendre
// de `tsx`/`ts-node`. Dépendances résolues via `prisma-tools/node_modules/`.
async function compileSeed() {
  const seedSrc = path.join(ROOT, "prisma", "seed.ts");
  if (!fs.existsSync(seedSrc)) {
    return;
  }

  const tscBin = path.join(
    ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsc.cmd" : "tsc"
  );
  log("Compilation du seed → prisma-tools/seed.js …");
  exec("tsc seed", tscBin, [
    "prisma/seed.ts",
    "--outDir",
    path.relative(ROOT, PRISMA_TOOLS),
    "--module",
    "commonjs",
    "--moduleResolution",
    "node",
    "--target",
    "es2022",
    "--esModuleInterop",
    "--resolveJsonModule",
    "--skipLibCheck",
    "--declaration",
    "false",
    "--sourceMap",
    "false",
  ], { cwd: ROOT });

  // Le seed.ts importe `@prisma/client` → le `.js` résout depuis node_modules.
  const compiled = path.join(PRISMA_TOOLS, "seed.js");
  if (fs.existsSync(compiled)) {
    log("Seed compilé → prisma-tools/seed.js");
  }
}

// ---------------------------------------------------------------------------
// Étape 3 — Icône .ico + clé publique embarquée
// ---------------------------------------------------------------------------
async function ensureAssets() {
  log("Génération de l'icône Windows (.ico) …");
  const iconPath = path.join(DESKTOP, "resources", "eduflow-icon.ico");
  exec("gen-desktop-assets", "node", [
    path.join(ROOT, "scripts", "gen-desktop-assets.mjs"),
    iconPath,
    "32",
  ]);

  log("Injection de la clé publique Ed25519 → license-public-key.txt …");
  let pubKey =
    process.env.LICENSE_PUBLIC_KEY ||
    process.env.LICENSES_PUBLIC_KEY ||
    "";

  if (!pubKey) {
    const envPath = path.join(ROOT, ".env");
    if (fs.existsSync(envPath)) {
      const content = await fsp.readFile(envPath, "utf8");
      const match =
        content.match(/LICENSE_PUBLIC_KEY\s*=\s*("(?:[^"\\]|\\.)*")/) ||
        content.match(/LICENSE_PUBLIC_KEY="(-+[\s\S]*?-+)"/);
      if (match) {
        pubKey = match[1].replace(/^"|"$/g, "").replace(/\\n/g, "\n");
      }
    }
  }

  if (!pubKey || !pubKey.includes("BEGIN PUBLIC KEY")) {
    throw new Error(
      "Clé publique Ed25519 introuvable. Définissez LICENSE_PUBLIC_KEY dans " +
        "votre environnement ou générez-en une via `npm run license:keygen -- --keygen`."
    );
  }

  // Lu par resolvePublicKey() (fallback dev) dans main.cjs. Placé à la racine
  // de l'artefact via `extraFiles` dans desktop/electron-builder.json.
  await fsp.writeFile(
    path.join(ELECTRON_SRC, "license-public-key.txt"),
    pubKey,
    "utf8"
  );
}

// ---------------------------------------------------------------------------
// Étape 4 — Dépendances Electron
// ---------------------------------------------------------------------------
async function ensureDesktopDeps() {
  const nodeModules = path.join(DESKTOP, "node_modules");
  if (!fs.existsSync(nodeModules)) {
    log("Installation des dépendances Desktop (electron + electron-builder)…");
    exec("npm install (desktop)", "npm", ["install"], { cwd: DESKTOP });
  }
}

// ---------------------------------------------------------------------------
// Étape 5 — Packaging electron-builder
// ---------------------------------------------------------------------------
function packageElectron() {
  log("Packaging Electron → desktop/release …");
  exec(
    "electron-builder",
    "npx",
    ["electron-builder", "--config", "electron-builder.json"],
    { cwd: DESKTOP }
  );
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------
async function main() {
  log(`Workspace : ${ROOT}`);
  log(`Desktop   : ${DESKTOP}\n`);

  try {
    await ensureNextStandalone();
    await ensurePrismaTools();
    await compileSeed();
    await ensureAssets();
    await ensureDesktopDeps();
    packageElectron();
    log("\n✅ Packaging Desktop terminé → desktop/release/");
  } catch (error) {
    console.error(
      "\n❌ Échec du build desktop :",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

main();
