#!/usr/bin/env node
/**
 * =============================================================================
 * TEST AUTOMATISÉ — INSCRIPTION PUBLIQUE (/register) + SEEDING DE DÉMONSTRATION
 * =============================================================================
 *
 * Ce script autonome simule une inscription réelle sur le serveur local :
 *   1. Il attend que http://localhost:3000 réponde ;
 *   2. Il localise l'identifiant de la Server Action `registerAction` dans les
 *      chunks client de la page /register (protocole officiel de Next.js :
 *      en-tête HTTP `Next-Action`) ;
 *   3. Il envoie les données du formulaire (case « jeu de données de
 *      démonstration » cochée : includeDemoData="on") en encodant la requête
 *      EXACTEMENT comme le ferait le navigateur (sérialiseur React Flight
 *      compilé par Next) ;
 *   4. Il interroge ensuite la base de données (via le client Prisma de
 *      l'application) pour vérifier que l'organisation créée contient bien
 *      des élèves, des cours, des dépenses, des paiements ET les comptes de
 *      démonstration (Secrétaire / Enseignant).
 *
 * Sorties :
 *   - Succès : "✅ TEST REUSSI : L'organisation a été créée et contient X
 *     élèves, Y cours et Z dépenses fictives."
 *   - Échec (HTTP, action refusée, organisation vide/incomplète) : erreur
 *     explicite "❌ TEST ÉCHOUÉ : ..." et code de sortie 1.
 *
 * Usage :
 *   node test-register-seed.mjs
 *   BASE_URL=http://localhost:3000 node test-register-seed.mjs
 *   CLEANUP=1 node test-register-seed.mjs   # supprime l'organisation de test
 *
 * Prérequis : `npm run dev` en cours d'exécution (le script attend jusqu'à
 * ~90 s que le serveur soit prêt).
 */

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  ""
);
const REGISTER_PAGE = `${BASE_URL}/register`;

// ---------------------------------------------------------------------------
// 0. Environnement (.env) — requis par le client Prisma (vérification en base)
// ---------------------------------------------------------------------------
for (const envFile of [".env", ".env.local"]) {
  const envPath = path.join(SCRIPT_DIR, envFile);
  if (existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
    } catch {
      console.warn(`⚠️  Impossible de charger ${envFile} (fichier ignoré).`);
    }
  }
}

const { PrismaClient } = require("@prisma/client");
// Sérialiseur React Flight compilé et embarqué par Next.js : encode les
// arguments d'une Server Action exactement comme le client navigateur.
const { encodeReply } = require(
  "next/dist/compiled/react-server-dom-webpack/client.node.js"
);

const prisma = new PrismaClient();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// 1. Attente du serveur de développement
// ---------------------------------------------------------------------------
async function waitForServer(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "inconnue";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(REGISTER_PAGE, { redirect: "manual" });
      if (response.ok) {
        console.log(`🌐 Serveur détecté sur ${BASE_URL}`);
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error?.message ?? String(error);
    }
    await sleep(1500);
  }
  throw new Error(
    `❌ TEST ÉCHOUÉ : le serveur ${BASE_URL} ne répond pas (dernière erreur : ${lastError}). ` +
      `Démarrez l'application avec \`npm run dev\` puis relancez le test.`
  );
}

/**
 * 2. Localise l'identifiant de la Server Action `registerAction` dans les
 *    chunks JavaScript du client. Le compilateur de Next.js marque chaque
 *    entrée d'action avec le commentaire
 *    `__next_internal_action_entry_do_not_use__ [{"<id>": {"name": "..."}}, ...]`.
 *    (Repli : appel `createServerReference("<id>", ...)` pour les builds de
 *    production où les commentaires sont minifiés.)
 */
async function findRegisterActionId() {
  const html = await (await fetch(REGISTER_PAGE)).text();

  const scriptUrls = [
    ...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g),
  ].map((match) => match[1]);

  const bundles = [html];
  for (const src of scriptUrls) {
    const url = src.startsWith("http") ? src : `${BASE_URL}${src}`;
    try {
      bundles.push(await (await fetch(url)).text());
    } catch {
      // Chunk inaccessible : on passe au suivant.
    }
  }

  for (const bundle of bundles) {
    for (const match of bundle.matchAll(
      /__next_internal_action_entry_do_not_use__\s*(\[[\s\S]*?\])\s*\*\//g
    )) {
      try {
        const entry = JSON.parse(match[1]);
        const actionMap = entry[0] ?? {};
        for (const [actionId, meta] of Object.entries(actionMap)) {
          if (meta?.name === "registerAction") {
            console.log(
              `🎯 Server Action "registerAction" localisée (id : ${actionId})`
            );
            return actionId;
          }
        }
      } catch {
        // Fragment de commentaire non JSON : on tente le suivant.
      }
    }

    // Repli (build de production, commentaires supprimés par la minification).
    for (const match of bundle.matchAll(
      /createServerReference\]?\)\("([0-9a-f]{16,})"/g
    )) {
      const after = bundle.slice(match.index, match.index + 3000);
      if (after.includes('"registerAction"')) {
        console.log(
          `🎯 Server Action "registerAction" localisée (repli, id : ${match[1]})`
        );
        return match[1];
      }
    }
  }

  throw new Error(
    `❌ TEST ÉCHOUÉ : impossible de localiser l'ID de la Server Action ` +
      `\`registerAction\` dans les chunks du client de ${REGISTER_PAGE}. ` +
      `Vérifiez que la page d'inscription est bien servie.`
  );
}

// ---------------------------------------------------------------------------
// 3. Données de formulaire (case démo OBLIGATOIRE, cochée par défaut)
// ---------------------------------------------------------------------------
function buildRegistrationForm(timestamp) {
  const form = new FormData();
  form.set("organizationName", `Centre Démo Test ${timestamp}`);
  form.set("firstName", "Jean");
  form.set("lastName", "Testeur");
  form.set("email", `demo-test-${timestamp}@example.com`);
  form.set("password", "Demo12345!");
  // La case « jeu de données de démonstration » est cochée par défaut dans le
  // formulaire ; une case cochée envoie la valeur "on".
  form.set("includeDemoData", "on");
  return form;
}

/** 4. Soumission via le protocole Server Actions (POST + en-tête Next-Action). */
async function submitRegistration(actionId, form) {
  // Encodage identique au navigateur pour un appel `useActionState` :
  // arguments (prevState, formData).
  const body = await encodeReply([null, form]);

  const response = await fetch(REGISTER_PAGE, {
    method: "POST",
    headers: {
      "Next-Action": actionId,
      Origin: BASE_URL,
      Accept: "text/x-component",
    },
    body,
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `❌ TEST ÉCHOUÉ : la requête d'inscription a échoué (HTTP ${response.status}).\n` +
        `Réponse du serveur : ${text.slice(0, 500)}`
    );
  }

  if (text.includes('"status":"success"') || text.includes("compte a été créé")) {
    return;
  }

  const messageMatch =
    text.match(/"message":"([^"]+)/) ?? text.match(/\\"message\\":\\"([^\\"]+)/);
  const detail = messageMatch
    ? messageMatch[1]
    : text.slice(0, 500).replace(/\s+/g, " ");

  throw new Error(
    `❌ TEST ÉCHOUÉ : l'inscription a été refusée ou n'a pas abouti. ${detail}`
  );
}

/**
 * 5. Vérification en base de données : l'organisation doit exister et
 *    contenir les données de démonstration (élèves, cours, dépenses,
 *    paiements, produits/services du catalogue POS, comptes Secrétaire /
 *    Enseignant).
 */
async function verifyDemoSeed(adminEmail) {
  const deadline = Date.now() + 30_000;

  while (true) {
    const admin = await prisma.user.findUnique({
      where: { email: adminEmail },
      include: { organization: true },
    });

    if (admin?.organization) {
      const organizationId = admin.organizationId;
            const [students, courses, expenses, payments, products, demoCategories, demoUsers] =
        await Promise.all([
          prisma.student.count({ where: { organizationId } }),
          prisma.course.count({ where: { organizationId } }),
          prisma.expense.count({ where: { organizationId } }),
          prisma.payment.count({ where: { organizationId } }),
          prisma.productService.findMany({
            where: { organizationId },
            select: { name: true, categoryId: true },
            orderBy: { name: "asc" },
          }),
          prisma.productCategory.findMany({
            where: { organizationId },
            select: { name: true },
            orderBy: { name: "asc" },
          }),
          prisma.user.findMany({
            where: {
              organizationId,
              role: { in: ["STAFF", "TEACHER"] },
            },
            select: { email: true, role: true, firstName: true, lastName: true },
          }),
        ]);

      return {
        organization: admin.organization,
        students,
        courses,
        expenses,
        payments,
        products,
        productNames: products.map((product) => product.name),
        // produits démonstration sans catégorie (optionnel sur un Article)
        productsWithoutCategory: products.filter((p) => p.categoryId === null),
        categories: demoCategories,
        categoryNames: demoCategories.map((c) => c.name),
        demoUsers,
      };
    }

    if (Date.now() > deadline) {
      throw new Error(
        `❌ TEST ÉCHOUÉ : aucune organisation n'a été créée pour le compte ` +
          `${adminEmail} — l'inscription n'a pas été persistée.`
      );
    }

    await sleep(2000);
  }
}

// ---------------------------------------------------------------------------
// 6. Programme principal
// ---------------------------------------------------------------------------
async function main() {
  console.log("🧪 TEST : inscription publique + seeding de démonstration");
  console.log(`   Cible : ${BASE_URL}`);

  await waitForServer();
  const actionId = await findRegisterActionId();

  const timestamp = Date.now().toString(36);
  const form = buildRegistrationForm(timestamp);
  const adminEmail = form.get("email");

  console.log(
    `📤 Envoi du formulaire d'inscription (includeDemoData="${form.get("includeDemoData")}")...`
  );
  console.log(`   Organisation : ${form.get("organizationName")}`);
  console.log(`   Admin        : ${adminEmail}`);

  const startedAt = Date.now();
  await submitRegistration(actionId, form);
  console.log(
    `✉️  Inscription acceptée par le serveur (${((Date.now() - startedAt) / 1000).toFixed(1)} s, seeding inclus)`
  );

  const result = await verifyDemoSeed(adminEmail);
    const {
    organization,
    students,
    courses,
    expenses,
    payments,
    products,
    productNames,
    productsWithoutCategory,
    categories,
    categoryNames,
    demoUsers,
  } = result;

  // --- Critères de réussite (jeu de démonstration complet et non vide) ---
  const problems = [];
  if (students < 6) {
    problems.push(`élèves insuffisants (${students}/6 attendus)`);
  }
  if (courses < 3) {
    problems.push(`cours insuffisants (${courses}/3 attendus)`);
  }
  if (expenses < 3) {
    problems.push(`dépenses insuffisantes (${expenses}/3 attendues)`);
  }
  if (products.length < 3) {
    problems.push(
      `produits/services du catalogue caisse insuffisants (${products.length}/6 attendus)`
    );
  }
  if (productsWithoutCategory.length === 0) {
    problems.push(`aucun produit démonstration sans catégorie (optionnel sur un Article)`);
  }
  if (
    !categoryNames.includes("Livres & Fascicules") ||
    !categoryNames.includes("Services Assermentés")
  ) {
    problems.push(
      `catégories personnalisées démo manquantes (attendues : Livres & Fascicules, Services Assermentés)`
    );
  }
  if (demoUsers.length < 2) {
    problems.push(`comptes de démonstration absents (${demoUsers.length}/2)`);
  }
  // Membres d'équipe démo attendus
  const secretaire = demoUsers.find(
    (u) => u.firstName === "Claire" && u.lastName === "Okou"
  );
  const enseignant = demoUsers.find(
    (u) => u.firstName === "Marc" && u.lastName === "Gnamien"
  );
  if (!secretaire || secretaire.role !== "STAFF") {
    problems.push(`membre secrétaire Claire Okou (STAFF) absent`);
  }
  if (!enseignant || enseignant.role !== "TEACHER") {
    problems.push(`membre enseignant Marc Gnamien (TEACHER) absent`);
  }

  if (problems.length > 0) {
    throw new Error(
      `❌ TEST ÉCHOUÉ : l'organisation « ${organization.name} » (slug : ${organization.slug}) ` +
        `a été créée mais le seeding de démonstration est incomplet — ${problems.join("; ")}. ` +
        `L'organisation est restée vide ou partielle : vérifiez les logs du serveur ` +
        `(\`[registerAction] Échec du seeding de démonstration\`).`
    );
  }

  console.log(
    `✅ TEST REUSSI : L'organisation a été créée et contient ${students} élèves, ${courses} cours, ${expenses} dépenses fictives et ${products.length} articles au catalogue caisse.`
  );
  console.log(`   Organisation : « ${organization.name} » (slug : ${organization.slug})`);
  console.log(`   Identifiant  : ${organization.id}`);
  console.log(`   Admin        : ${adminEmail} (mot de passe : Demo12345!)`);
  for (const demoUser of demoUsers) {
    console.log(`   Compte démo  : ${demoUser.email} (${demoUser.role}, mot de passe : demo12345)`);
  }
  console.log(`   Paiements    : ${payments} écritures fictives enregistrées`);
    console.log(`   Catalogue POS : ${products.length} articles/services de démonstration :`);
  for (const productName of productNames) {
    console.log(`     • ${productName}`);
  }
  console.log(`   Produits sans catégorie : ${productsWithoutCategory.length}`);
  console.log(`   Catégories personnalisées : ${categories.length}`);
  for (const categoryName of categoryNames) {
    console.log(`     • ${categoryName}`);
  }

  if (process.env.CLEANUP === "1") {
    // Suppression en cascade (onDelete: Cascade sur l'ensemble des modèles).
    await prisma.organization.delete({ where: { id: organization.id } });
    console.log("🧹 CLEANUP=1 : l'organisation de test a été supprimée.");
  } else {
    console.log(
      "ℹ️  L'organisation de test a été conservée (CLEANUP=1 pour la supprimer)."
    );
  }
}

main()
  .then(() => {
    console.log("🏁 Fin du test — statut : SUCCÈS");
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error(error?.message ?? error);
    console.log("🏁 Fin du test — statut : ÉCHEC");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


