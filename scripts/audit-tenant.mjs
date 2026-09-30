/**
 * Audit statique — isolation multi-tenant des Server Actions.
 *
 * Analyse chaque fonction exportée de `src/actions/*.ts` et
 * `src/lib/actions/*.ts` et signale celles qui :
 *   - n'utilisent PAS le garde `getCurrentOrganizationId()` / `getValidatedSessionContext()` ;
 *   - interrogent Prisma sans jamais filtrer sur `organizationId`.
 *
 * Lecture seule : ne modifie rien (usage : node scripts/audit-tenant.mjs).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/actions", "src/lib/actions"];

/** Mots-clés marquant une écriture métier devant être protégée. */
const MUTATION_HINTS = [
  /\.create\(/,
  /\.createMany\(/,
  /\.update\(/,
  /\.updateMany\(/,
  /\.upsert\(/,
  /\.delete\(/,
  /\.deleteMany\(/,
];

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (full.endsWith(".ts") && !full.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** Découpe le fichier en fonctions exportées de premier niveau. */
function splitExportedFunctions(source) {
  const lines = source.split(/\r?\n/);
  const results = [];
  let current = null;

  for (const line of lines) {
    const m = line.match(
      /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/
    );
    if (m) {
      if (current) results.push(current);
      current = { name: m[1], startLine: 0, body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) results.push(current);
  return results;
}

const report = [];
let totalFn = 0;
let totalMutating = 0;
let suspicious = 0;

for (const root of ROOTS) {
  for (const file of listFiles(root)) {
    const source = readFileSync(file, "utf8");
    for (const fn of splitExportedFunctions(source)) {
      const body = fn.body.join("\n");
      totalFn += 1;

      const mutates = MUTATION_HINTS.some((re) => re.test(body));
      const hasTenantGuard =
        /getCurrentOrganizationId\s*\(/.test(body) ||
        /getValidatedSessionContext\s*\(/.test(body) ||
        /getCurrentSessionUser\s*\(/.test(body) ||
        /getCurrentSessionActor\s*\(/.test(body) ||
        /assertCanMutate\s*\(/.test(body);
      const hasOrgFilter = /organizationId/.test(body);
      const touchesPrisma = /prisma\./.test(body);

      if (!mutates) continue;
      totalMutating += 1;

      const problems = [];
      if (!hasTenantGuard) problems.push("aucun garde de session");
      if (touchesPrisma && !hasOrgFilter) problems.push("Prisma sans organizationId");
      if (hasTenantGuard && touchesPrisma && !hasOrgFilter) {
        problems.push("garde présente mais filtre org absent");
      }

      if (problems.length > 0) {
        suspicious += 1;
        report.push({ file, fn: fn.name, problems });
      }
    }
  }
}

console.log(`Fonctions exportées analysées : ${totalFn}`);
console.log(`Fonctions en écriture (CRUD)  : ${totalMutating}`);
console.log(`Fonctions à risque            : ${suspicious}\n`);

for (const r of report) {
  console.log(`${r.file}  →  ${r.fn}()   [${r.problems.join(", ")}]`);
}
