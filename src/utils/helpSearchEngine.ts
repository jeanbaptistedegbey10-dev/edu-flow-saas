import {
  HELP_TOPICS,
  HUMAN_SUPPORT_TRIGGERS,
  type HelpTopic,
} from "@/data/helpKnowledgeBase";

/**
 * Moteur de recherche flou local de l'assistant d'aide (100 % hors ligne).
 *
 * Conçu pour être tolérant aux fautes de frappe et aux mots omis :
 * - normalisation (minuscules + suppression des accents) ;
 * - filtrage des mots vides français (« comment », « le », « de », « mon »…) ;
 * - correspondance exacte, préfixe ou distance de Levenshtein contre les
 *   mots-clés et synonymes de chaque sujet de la base de connaissances ;
 * - bonus pour les expressions composées (« cahier de texte »).
 *
 * Exemples : « comment enseignant » ou « ajoté prof » → « Ajouter un
 * enseignant et lui attribuer un cours ».
 */

// --------------------------------------
// Normalisation & mots vides
// --------------------------------------

/** Minuscules + suppression des accents (NFD) pour une comparaison robuste. */
export function normalizeHelpText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Mots vides français : articles, prépositions, pronoms, auxiliaires et
 * formules de politesse. Le sens porteur (étudiant, visa, paiement…) est
 * toujours conservé — seuls les mots sans valeur discriminante sont retirés.
 */
const HELP_STOP_WORDS = new Set([
  "a",
  "au",
  "aux",
  "avec",
  "besoin",
  "bien",
  "bonjour",
  "ce",
  "cet",
  "cette",
  "comment",
  "d",
  "dans",
  "de",
  "des",
  "dois",
  "donc",
  "du",
  "elle",
  "en",
  "est",
  "et",
  "etre",
  "eu",
  "faire",
  "fait",
  "faut",
  "il",
  "ils",
  "j",
  "je",
  "juste",
  "l",
  "la",
  "le",
  "les",
  "lui",
  "ma",
  "mais",
  "me",
  "merci",
  "mes",
  "moi",
  "mon",
  "n",
  "ne",
  "nous",
  "on",
  "ou",
  "par",
  "pas",
  "peut",
  "peux",
  "plus",
  "pour",
  "puis",
  "qu",
  "que",
  "quel",
  "quelle",
  "quelles",
  "quels",
  "qui",
  "quoi",
  "s",
  "sa",
  "sans",
  "se",
  "ses",
  "soit",
  "son",
  "sont",
  "souhaite",
  "suis",
  "sur",
  "svp",
  "stp",
  "t",
  "ta",
  "te",
  "tes",
  "toi",
  "ton",
  "tu",
  "un",
  "une",
  "vos",
  "votre",
  "vous",
  "veux",
  "veut",
  "voudrais",
  "y",
]);

/** Segmente une question en termes porteurs de sens (sans mots vides). */
function tokenizeQuery(query: string): string[] {
  return normalizeHelpText(query)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !HELP_STOP_WORDS.has(token));
}

/** Concaténation « mots vides retirés » d'une question (pour les expressions). */
function compactQuery(query: string): string {
  return tokenizeQuery(query).join(" ");
}

// --------------------------------------
// Distance de Levenshtein (avec sortie anticipée)
// --------------------------------------

/**
 * Distance d'édition entre deux mots, ou `null` dès que la distance dépasse
 * `maxDistance` (permet d'abandonner tôt : un seul passage de matrice).
 */
function levenshteinWithin(
  a: string,
  b: string,
  maxDistance: number,
): number | null {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return null;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i];
    let rowMinimum = i;

    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
      current.push(value);
      if (value < rowMinimum) rowMinimum = value;
    }

    // Toute la ligne dépasse déjà le budget : inutile de continuer.
    if (rowMinimum > maxDistance) return null;
    previous = current;
  }

  return previous[b.length] <= maxDistance ? previous[b.length] : null;
}

// --------------------------------------
// Préparation des sujets (une seule fois au chargement)
// --------------------------------------

const EXACT_SCORE = 3;
const PREFIX_SCORE = 2;
const FUZZY_ONE_SCORE = 2;
const FUZZY_TWO_SCORE = 1.25;
const PHRASE_BONUS = 4;
/** Score minimal pour considérer qu'un sujet répond à la question. */
const MIN_MATCH_SCORE = 2.5;

type WeightedTerm = { term: string; weight: number };

type PreparedTopic = {
  topic: HelpTopic;
  /** Termes pondérés (mots simples) issus des mots-clés, synonymes et question. */
  terms: WeightedTerm[];
  /** Expressions composées (« cahier de texte ») recherchées littéralement. */
  phrases: string[];
};

function buildPreparedTopic(topic: HelpTopic): PreparedTopic {
  const terms = new Map<string, number>();

  const addTerm = (raw: string, weight: number) => {
    const normalized = normalizeHelpText(raw.trim());
    // Seuls les mots simples alimentent la correspondance terme à terme.
    if (!normalized || normalized.includes(" ")) return;
    terms.set(normalized, Math.max(terms.get(normalized) ?? 0, weight));
  };

  topic.keywords.forEach((keyword) => addTerm(keyword, 1));
  topic.synonyms.forEach((synonym) => {
    synonym
      .split(/[^a-z0-9éèêàçùûôîï]+/i)
      .forEach((word) => addTerm(word, 0.9));
  });
  normalizeHelpText(topic.question)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !HELP_STOP_WORDS.has(word))
    .forEach((word) => addTerm(word, 0.6));

  const phrases = [...topic.keywords, ...topic.synonyms]
    .filter((entry) => entry.trim().includes(" "))
    .map((entry) => normalizeHelpText(entry));

  return {
    topic,
    terms: [...terms].map(([term, weight]) => ({ term, weight })),
    phrases,
  };
}

const PREPARED_TOPICS: PreparedTopic[] = HELP_TOPICS.map(buildPreparedTopic);

// --------------------------------------
// Scoring & API publique
// --------------------------------------

/** Meilleur score d'un token de la question contre un terme d'un sujet. */
function scoreTokenAgainstTerm(token: string, term: string): number {
  if (token === term) return EXACT_SCORE;

  // Préfixe réciproque (ex. « paiement » ↔ « paiements »).
  if (token.length >= 4 && term.length >= 4) {
    if (term.startsWith(token) || token.startsWith(term)) return PREFIX_SCORE;
  }

  // Une faute de frappe isolée (ex. « etudian » → « etudiant »).
  if (token.length >= 4 && levenshteinWithin(token, term, 1) !== null) {
    return FUZZY_ONE_SCORE;
  }

  // Deux fautes : uniquement sur des mots assez longs et partageant leurs
  // deux premières lettres (ex. « ajoté » → « ajouter »), afin d'éviter les
  // rapprochements fallacieux (« cahier » ↔ « panier »).
  if (
    token.length >= 5 &&
    token[0] === term[0] &&
    token[1] === term[1] &&
    levenshteinWithin(token, term, 2) !== null
  ) {
    return FUZZY_TWO_SCORE;
  }

  return 0;
}

export type HelpSearchMatch = {
  /** Sujet correspondant. */
  topic: HelpTopic;
  /** Score brut (0 = aucun lien). */
  score: number;
  /** Score ramené entre 0 et 1 selon la longueur de la question. */
  confidence: number;
};

/**
 * Recherche les sujets d'aide correspondant à une question libre.
 * Retourne les correspondances triées par score décroissant (maximum `limit`).
 */
export function searchHelpTopics(
  query: string,
  limit = 3,
): HelpSearchMatch[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  // Question « brute » normalisée (mots vides conservés) et version compacte
  // (mots vides retirés) : les expressions composées sont testées sur les deux,
  // afin de couvrir « cahier de texte » comme « mon élève est absent ».
  const raw = ` ${normalizeHelpText(query)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
  const compact = compactQuery(query);

  const matches: HelpSearchMatch[] = [];

  for (const prepared of PREPARED_TOPICS) {
    let score = 0;

    for (const token of tokens) {
      let best = 0;

      for (const { term, weight } of prepared.terms) {
        const candidate = scoreTokenAgainstTerm(token, term) * weight;

        if (candidate > best) best = candidate;
        if (best >= EXACT_SCORE) break;
      }

      score += best;
    }

    // Bonus expressions composées (« cahier de texte », « mot de passe »…).
    for (const phrase of prepared.phrases) {
      if (raw.includes(` ${phrase} `) || compact.includes(phrase)) {
        score += PHRASE_BONUS;
        break;
      }
    }

    if (score > 0) {
      matches.push({
        topic: prepared.topic,
        score,
        confidence: Math.min(1, score / (tokens.length * EXACT_SCORE)),
      });
    }
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}

/**
 * Retourne le meilleur sujet pour une question, ou `null` si la correspondance
 * est trop faible (le widget propose alors ses sujets phares).
 */
export function findBestHelpTopic(query: string): HelpTopic | null {
  const [best] = searchHelpTopics(query, 1);

  return best && best.score >= MIN_MATCH_SCORE ? best.topic : null;
}

// --------------------------------------
// Détection d'intention « parler à un humain »
// --------------------------------------

const HUMAN_TRIGGER_PATTERNS = HUMAN_SUPPORT_TRIGGERS.map((trigger) => {
  const normalized = normalizeHelpText(trigger)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const words = normalized
    .split(" ")
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  return new RegExp(`(^|\\s)${words.join("\\s+")}(\\s|$)`);
});

/**
 * Vrai si la question demande explicitement un contact humain
 * (« humain », « agent », « support », « téléphone », « whatsapp »…).
 */
export function isHumanSupportRequest(query: string): boolean {
  const normalized = normalizeHelpText(query).replace(/[^a-z0-9]+/g, " ");

  return HUMAN_TRIGGER_PATTERNS.some((pattern) => pattern.test(normalized));
}
