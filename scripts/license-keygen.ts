/**
 * Générateur de couple de clés Ed25519 pour les licences EduFlow.
 *
 * Usage (Super-Admin / opérations) :
 *   npx tsx scripts/license-keygen.ts            # génère + affiche sur stdout
 *   npx tsx scripts/license-keygen.ts --keygen     # idem (flag explicite)
 *   npx tsx scripts/license-keygen.ts --out .env.licensing   # écrit dans un fichier
 *
 *   npm run license:keygen -- --keygen --out .env.licensing
 *
 * La clé PRIVÉE ne doit JAMAIS être déployée sur une instance cliente — elle
 * reste sur le serveur d'administration Super-Admin. La clé PUBLIQUE est injectée
 * dans le wrapper Docker (.env.docker) et l'exécutable Desktop.
 *
 * Ce script est volontairement sans dépendance réseau : il utilise uniquement
 * `src/lib/crypto-license.ts` (Node.js `crypto`, courbe Ed25519).
 */
import fs from "node:fs";
import path from "node:path";

import { generateLicenseKeyPair } from "../src/lib/crypto-license";

function parseArgs(argv: string[]): { keygen: boolean; out?: string } {
  const args = argv.slice(2);
  const result: { keygen: boolean; out?: string } = { keygen: false };

  for (const arg of args) {
    if (arg === "--keygen" || arg === "-k") {
      result.keygen = true;
    } else if (arg === "--out" || arg === "-o") {
      // la valeur suit
    } else if (result.out === undefined && !arg.startsWith("-")) {
      result.out = arg;
    }
  }

  return result;
}

function main(): void {
  const { keygen } = parseArgs(process.argv);

  if (!keygen) {
    console.error(
      "ℹ️  Utilisation : npx tsx scripts/license-keygen.ts --keygen [--out <fichier>]\n" +
        "   (--keygen déclenche la génération ; sans ce flag, le script n'agit pas.)\n"
    );
    process.exit(0);
  }

  console.log("== Génération du couple de clés Ed25519 (licence EduFlow) ==\n");

  const { privateKeyPem, publicKeyPem } = generateLicenseKeyPair();

  const banner = "# EduFlow — Couple de clés de licence Ed25519 (NE PAS COMMITER la clé privée)";
  const content =
    `${banner}\n` +
    `# Généré le ${new Date().toISOString()}\n` +
    `# Clé PRIVÉE : serveur Super-Admin UNIQUEMENT — jamais côté client.\n` +
    `LICENSE_PRIVATE_KEY="${privateKeyPem.replace(/\n/g, "\\n")}"\n` +
    `# Clé PUBLIQUE : déployée sur chaque instance cliente (self-hosted / desktop).\n` +
    `LICENSE_PUBLIC_KEY="${publicKeyPem.replace(/\n/g, "\\n")}"\n`;

  const { stdout } = process;

  stdout.write(content + "\n");

  const outArg = parseArgs(process.argv).out;
  if (outArg) {
    const target = path.isAbsolute(outArg)
      ? outArg
      : path.resolve(process.cwd(), outArg);
    fs.writeFileSync(target, content, "utf8");
    console.log(`\n💾 Écrit dans : ${target}`);
  } else {
    console.log(
      "\n📋 Copiez-collez ces deux lignes dans votre .env (et .env.docker) :"
    );
    console.log(`LICENSE_PUBLIC_KEY="${publicKeyPem.replace(/\n/g, "\\n")}"`);
    console.log(
      "\n💡 Conservez la clé PRIVÉE en lieu sûr et ajoutez-la à votre .env serveur" +
        " (jamais exposée aux clients)."
    );
  }
}

main();
