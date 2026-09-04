/**
 * Smoke test du moteur de recherche flou de l'assistant d'aide.
 *
 * Exécution : npx tsx scripts/smoke-help-search.ts
 * Vérifie la normalisation (accents, mots vides), la tolérance aux fautes de
 * frappe, la correspondance par synonymes et la détection d'escalade humaine.
 */

import {
  findBestHelpTopic,
  isHumanSupportRequest,
} from "../src/utils/helpSearchEngine";

let failures = 0;

function expectTopic(query: string, expectedId: string) {
  const topic = findBestHelpTopic(query);

  if (topic?.id !== expectedId) {
    failures += 1;
    console.error(
      `✗ « ${query} » → attendu « ${expectedId} », obtenu « ${topic?.id ?? "null"} »`,
    );
  } else {
    console.log(`✓ « ${query} » → ${topic.id}`);
  }
}

function expectHuman(query: string, expected: boolean) {
  const result = isHumanSupportRequest(query);

  if (result !== expected) {
    failures += 1;
    console.error(`✗ « ${query} » → escalade humaine attendue : ${expected}`);
  } else {
    console.log(`✓ « ${query} » → humain : ${result}`);
  }
}

// Mots omis / formulaires incomplets
expectTopic("comment enseignant", "teachers");
expectTopic("ajoté prof", "teachers");
expectTopic("ajouter un prof", "teachers");
expectTopic("inscrire un élève", "enrollment");
expectTopic("associer un étudiant à un cours", "enrollment");
expectTopic("présence des élèves", "attendance");
expectTopic("mon élève est absent", "attendance");
expectTopic("cahier de texte", "attendance");
expectTopic("dossier visa", "visa");
expectTopic("rendez-vous consulat", "visa-appointment");
expectTopic("documents du dossier", "visa-documents");
expectTopic("payer la scolarité", "payments");
expectTopic("encaisser avec wave", "mobile-money");
expectTopic("MTN money", "mobile-money");
expectTopic("exporter les finances", "financial-exports");
expectTopic("créer une classe", "classes");
expectTopic("bulletin de notes", "grades");
expectTopic("gérer les permissions", "roles");
expectTopic("mode sombre", "dark-mode");
expectTopic("mot de passe oublié", "password-reset");
expectTopic("connexion hors ligne", "offline-sync");
expectTopic("vendre au comptoir", "pos");
expectTopic("faire l'appel", "attendance");

// Fautes de frappe
expectTopic("ajoté un étudian", "enrollment");
expectTopic("paiemant scolaritée", "payments");

// Questions hors périmètre → aucun sujet
for (const query of ["recette de gâteau", "météo demain"]) {
  if (findBestHelpTopic(query) !== null) {
    failures += 1;
    console.error(`✗ « ${query} » → devrait être null`);
  } else {
    console.log(`✓ « ${query} » → null (hors périmètre)`);
  }
}

// Détection d'escalade humaine
expectHuman("je veux parler à quelqu'un", true);
expectHuman("donnez-moi le numéro de téléphone", true);
expectHuman("contacter le support", true);
expectHuman("je préfère un humain", true);
expectHuman("parler sur whatsapp", true);
expectHuman("comment encaisser une vente", false);
expectHuman("ajouter un enseignant", false);

if (failures > 0) {
  console.error(`\n${failures} échec(s).`);
  process.exit(1);
}

console.log("\nTous les tests du moteur de recherche passent ✅");
