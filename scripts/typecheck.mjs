/**
 * Lance `tsc --noEmit` avec une pile augmentée.
 *
 * CONTEXTE : le client Prisma généré dépasse 4 Mo de déclarations ; sur
 * Windows, la taille de pile par défaut de Node (~1 Mo) fait déborder
 * TypeScript (`RangeError: Maximum call stack size exceeded`) dès qu'il
 * compare les types Prisma — `npx tsc --noEmit` échoue alors SANS afficher
 * aucune erreur de code. Un `NODE_OPTIONS=--stack_size=…` est refusé par
 * Node : l'option doit être passée directement sur la ligne de commande.
 *
 * Équivalent à `npx tsc --noEmit`, mais exécutable partout.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const tscPath = require.resolve("typescript/lib/tsc.js");

const child = spawn(
  process.execPath,
  ["--stack-size=60000", tscPath, "--noEmit"],
  { stdio: "inherit" }
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});