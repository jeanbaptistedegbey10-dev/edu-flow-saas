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
    "Consignes :",
    "- Réponds toujours en français, de façon concise (120 mots maximum).",
    "- Structure en étapes numérotées courtes quand tu expliques un workflow.",
    "- Utilise uniquement les sujets listés ci-dessus : n'invente jamais de",
    "  menu, de bouton ou de fonctionnalité.",
    "- Si la question demande un contact humain, donne l'e-mail",
    "  contact@eduflow.com et le téléphone +229 00 00 00 00.",
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
