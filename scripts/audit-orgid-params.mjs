/**
 * Audit statique — Server Actions acceptant un `organizationId` en paramètre.
 *
 * RISQUE MAJEUR Next.js : toute fonction exportée d'un fichier « use server »
 * devient un ENDPOINT HTTP appelable depuis le client. Si elle accepte un
 * `organizationId` en argument SANS le revalider contre la session, un attaquant
 * peut viser n'importe quel tenant (IDOR cross-tenant).
 *
 * Lecture seule (usage : node scripts/audit-orgid-params.mjs).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/actions", "src/lib/actions"];

/** Gardeфика : motifs prouvant que l'org est bien dérivée de la session. */
const SAFE_GUARDS = [
  /getCurrentOrganizationId\s*\(/,
  /getValidatedSessionContext\s*\(/,
  /getCurrentSessionUser\s*\(/,
  /getCurrentSessionActor\s*\(/,
  /getSuperAdminContext\s*\(/,
];

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

function splitExportedFunctions(source) {
  const results = [];
  let current = null;
  for (const line of source.split(/\r?\n/)) {
    const m = line.match(
      /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/
    );
    if (m) {
      if (current) results.push(current);
      // La ligne de déclaration DOIT faire partie de la signature : le
      // paramètre `organizationId` peut y figurer sur une seule ligne.
      current = { name: m[1], signature: [line], body: [] };
    } else if (current) {
      if (current.signature.length < 8) current.signature.push(line);
      current.body.push(line);
    }
  }
  if (current) results.push(current);
  return results;
}

let vulnerable = 0;
let reviewed = 0;

for (const root of ROOTS) {
  for (const file of listFiles(root)) {
    const source = readFileSync(file, "utf8");
    if (!source.includes('"use server"')) continue;

    for (const fn of splitExportedFunctions(source)) {
      const signature = fn.signature.join(" ");
      const body = fn.body.join("\n");

      // Le paramètre doit être un identifiant d'organisationNU de la session.
      const takesOrgId = /organizationId\s*:\s*string/.test(signature);
      if (!takesOrgId) continue;

      reviewed += 1;
      const isSafe = SAFE_GUARDS.some((re) => re.test(body));

      if (!isSafe) {
        vulnerable += 1;
        console.log(`\n⚠️  ${file}`);
        console.log(`   ${fn.name}(${signature.replace(/\s+/g, " ").trim()})`);
        console.log(`   → organisationId recu DU CLIENT, aucune garde de session.`);
      } else {
        console.log(`   OK  ${file} :: ${fn.name}()  (org dérivée de la session)`);
      }
    }
  }
}

console.log(
  `\nServer Actions prenant organizationId en paramètre : ${reviewed}` +
    `\nDont NON protégées                              : ${vulnerable}`
);
