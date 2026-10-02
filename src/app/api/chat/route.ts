import { NextResponse } from "next/server";

import { HELP_TOPICS } from "@/data/helpKnowledgeBase";
import { findBestHelpTopic } from "@/utils/helpSearchEngine";

/**
 * Route `/api/chat` — passerelle Gemini de l'assistant d'aide (mode cloud).
 *
 * Le client (`HelpAssistant`) n'appelle cette route que lorsque
 * `NEXT_PUBLIC_AI_MODE=cloud` et que le navigateur est en ligne ; en cas
 * d'échec (absence de clé, erreur amont, timeout), il replie automatiquement
 * sur le moteur de recherche flou local.
 *
 * Réponse réussie :
 *   { reply, mode: "cloud", topicId?, route?, routeName? }
 * Échec contrôlé (le client doit replier sur le local) :
 *   503 { error: "AI_UNAVAILABLE" }  — clé GEMINI_API_KEY absente
 *   502 { error: "AI_UPSTREAM_ERROR" } — Gemini injoignable / réponse vide
 *   400 { error: "INVALID_REQUEST" }  — corps de requête invalide
 */

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const GEMINI_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_TOKENS = 400;

/**
 * Règles métier EduFlow injectées dans l'instruction système.
 *
 * Ces règles ne sont PAS redécouvertes par le modèle : elles décrivent les
 * invariants du domaine (cycle de vie des classes, garde-fou de clôture,
 * sauvegardes automatiques, encaissement libre POS, bulletin A4) qui
 * conditionnent la validité des réponses. Sans elles, Gemini peut proposer un
 * menu inexistant, inventer un blocage de caisse ou laisser croire qu'une
 * suppression est définitive.
 */
const BUSINESS_RULES = [
  "CYCLE DE VIE D'UNE CLASSE : Planifiée → En cours (Démarrer) → Clôturée (Terminer) → Archivée. Le désarchivage réactive la classe ET son effectif : rien n'est jamais supprimé définitivement.",
  "PRÉREQUIS DE CLÔTURE (3, bloquants) : au moins une séance avec présences saisies, au moins une séance avec cahier de texte rempli, et des évaluations créées et entièrement notées. Si l'un manque : dialogue « Clôture impossible — prérequis manquants » et navigation bloquée.",
  "SAUVEGARDE & RESTAURATION : une sauvegarde automatique de l'organisation est créée AVANT toute purge, réinitialisation ou restauration. Les snapshots expirent après 14 jours. La restauration exige le mot RESTAURER et crée elle-même une sauvegarde de sécurité de l'état courant.",
  "CAISSE POS : le fonctionnement est en ENCAISSEMENT LIBRE — aucune ouverture ni fermeture de session n'est nécessaire pour vendre. Toute mention de « caisse fermée » ou « veuillez ouvrir la caisse » est FAUSSE. Chaque vente est tracée dans le journal d'audit avec l'identifiant et le nom de son auteur, et produit une facturette imprimable.",
  "BULLETIN A4 : la fiche d'un élève dispose d'un bouton « Voir / Imprimer le rapport » produisant un bulletin A4 (logo, en-tête, notes par module, assiduité, appréciation, signatures). L'appréciation est générée automatiquement mais reste personnalisable, et le texte personnalisé est conservé à l'impression.",
  "RÔLES : ADMIN et SUPER_ADMIN gèrent le cycle de vie, les sauvegardes et les rôles ; STAFF (secrétariat) gère l'inscription et la caisse ; TEACHER ne voit que ses cours, ses classes et ses émargements, sans aucun accès financier.",
];

/** Ancrage du prompt : la liste officielle des workflows EduFlow. */
function buildSystemPrompt(): string {
  const topics = HELP_TOPICS.map(
    (topic) => `- ${topic.question} (section : ${topic.routeName})`,
  ).join("\n");

  return [
    "Tu es l'assistant support officiel d'EduFlow, la plateforme de gestion",
    "des centres de formation (étudiants, enseignants, classes, présences,",
    "évaluations, procédures visa, paiements, caisse POS, trésorerie, rôles).",
    "",
    "Sujets documentés (base de connaissances officielle) :",
    topics,
    "",
    "Règles métier impératives (EduFlow) :",
    ...BUSINESS_RULES,
    "",
    "Consignes :",
    "- Réponds toujours en français, de façon concise (120 mots maximum).",
    "- Structure en étapes numérotées courtes quand tu expliques un workflow.",
    "- Utilise uniquement les sujets listés ci-dessus : n'invente jamais de",
    "  menu, de bouton ou de fonctionnalité.",
    "- Si la question demande un contact humain, invite à passer par le",
    "  formulaire de contact du site (/contact) ou par téléphone / WhatsApp",
    "  au +229 01 62 20 48 25 (Bénin) ou +228 97 78 52 70 (Togo).",
    "  Ne communique AUCUNE adresse e-mail : elles ne sont pas publiées.",
    "- Si la question sort du périmètre EduFlow, propose poliment de parler",
    "  à un agent humain.",
  ].join("\n");
}

/** Extrait le texte de la première réponse Gemini (réponse tolérante). */
function extractReplyText(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;

  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const content = (candidates[0] as { content?: unknown }).content;
  if (typeof content !== "object" || content === null) return null;

  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return null;

  const text = parts
    .map((part) =>
      typeof part === "object" &&
      part !== null &&
      typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "",
    )
    .join("")
    .trim();

  return text.length > 0 ? text : null;
}

export async function POST(request: Request) {
  // Corps de la requête : { message: string }
  let message = "";
  try {
    const body = (await request.json()) as { message?: unknown };
    message =
      typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
  } catch {
    message = "";
  }

  if (!message) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    // Mode cloud demandé mais non configuré : le client replie sur le local.
    return NextResponse.json({ error: "AI_UNAVAILABLE" }, { status: 503 });
  }

  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
        contents: [{ role: "user", parts: [{ text: message }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "AI_UPSTREAM_ERROR" },
        { status: 502 },
      );
    }

    const payload: unknown = await response.json();
    const reply = extractReplyText(payload);

    if (!reply) {
      return NextResponse.json(
        { error: "AI_UPSTREAM_ERROR" },
        { status: 502 },
      );
    }

    // Ancrage local : rattache la question à un workflow connu pour que le
    // client affiche la maquette Generative UI et le bouton de navigation.
    const topic = findBestHelpTopic(message);

    return NextResponse.json({
      reply,
      mode: "cloud",
      topicId: topic?.id ?? null,
      route: topic?.route ?? null,
      routeName: topic?.routeName ?? null,
    });
  } catch {
    return NextResponse.json({ error: "AI_UPSTREAM_ERROR" }, { status: 502 });
  }
}
