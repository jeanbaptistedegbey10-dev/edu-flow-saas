"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  CloudIcon,
  GraduationCapIcon,
  HeadsetIcon,
  LifeBuoyIcon,
  NavigationIcon,
  SendIcon,
  SparklesIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react";

import { HumanSupportCard } from "@/components/help/HumanSupportCard";
import { HelpUiPreview } from "@/components/help/HelpUiPreview";
import {
  HELP_TOPICS,
  getHelpTopicById,
  type HelpTopicId,
} from "@/data/helpKnowledgeBase";
import { cn } from "@/lib/utils";
import {
  findBestHelpTopic,
  isHumanSupportRequest,
} from "@/utils/helpSearchEngine";

/**
 * Assistant d'aide interactif d'EduFlow (widget flottant du tableau de bord).
 *
 * Moteur de support HYBRIDE :
 * 1. Escalade humaine — toute demande de contact humain (« humain », « agent »,
 *    « support », « whatsapp »…) affiche une carte dédiée (WhatsApp prérempli,
 *    e-mail, téléphone) avant même toute recherche.
 * 2. Mode cloud — si `NEXT_PUBLIC_AI_MODE=cloud` et que le navigateur est en
 *    ligne, la question part vers `/api/chat` (Gemini, ancré sur la base de
 *    connaissances) ; la réponse est enrichie du workflow détecté (maquette
 *    Generative UI + navigation directe).
 * 3. Mode local — sinon (ou en cas d'échec du cloud), un moteur de recherche
 *    flou 100 % hors ligne (`helpSearchEngine`) renvoie le guide pas à pas,
 *    la maquette interactive et le bouton de navigation directe.
 */

// --------------------------------------
// Mode d'intelligence (hybride)
// --------------------------------------

/**
 * `NEXT_PUBLIC_AI_MODE` (inliné au build) pilote le mode de réponse :
 * « cloud » → tentative Gemini puis repli local ; toute autre valeur
 * (défaut : « local ») → moteur local intégré, 100 % hors ligne.
 */
const AI_MODE = (process.env.NEXT_PUBLIC_AI_MODE ?? "local")
  .trim()
  .toLowerCase();
const CLOUD_REQUESTED = AI_MODE === "cloud";

const CLOUD_TIMEOUT_MS = 12_000;
const LOCAL_RESPONSE_DELAY_MS = 700;
const HUMAN_RESPONSE_DELAY_MS = 550;

type CloudReplyPayload = {
  reply?: unknown;
  topicId?: unknown;
  route?: unknown;
  routeName?: unknown;
};

/** Interroge la passerelle Gemini (`/api/chat`). Retourne null si indisponible. */
async function requestCloudReply(
  message: string,
): Promise<CloudReplyPayload | null> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    CLOUD_TIMEOUT_MS,
  );

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });

    if (!response.ok) return null;

    return (await response.json()) as CloudReplyPayload;
  } catch {
    // Hors ligne, timeout ou erreur amont : le repli local prend le relais.
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// --------------------------------------
// Modèle de conversation
// --------------------------------------

type ChatMessage =
  | { id: number; role: "user"; text: string }
  | {
      id: number;
      role: "bot";
      text: string;
      steps?: string[];
      topicId?: HelpTopicId;
      route?: string;
      routeName?: string;
      showSuggestions?: boolean;
      /** Affiche la carte d'escalade humaine sous la bulle. */
      humanSupport?: boolean;
      /** Origine de la réponse (badge discret). */
      source?: "local" | "cloud";
      /** Vrai si le cloud était demandé mais indisponible (repli local). */
      cloudFallback?: boolean;
    };

type BotMessage = Extract<ChatMessage, { role: "bot" }>;
/** Message bot en construction (identifiant attribué à l'insertion). */
type BotMessageDraft = Omit<BotMessage, "id" | "role">;

const WELCOME_MESSAGE: BotMessage = {
  id: 0,
  role: "bot",
  text: "Bonjour 👋 Je suis l'assistant EduFlow. Je vous guide pas à pas — même hors ligne — avec des aperçus interactifs de l'interface. Que souhaitez-vous apprendre ?",
  showSuggestions: true,
};

const FALLBACK_TEXT =
  "Je n'ai pas encore de guide pour cette question. En revanche, je maîtrise parfaitement ces sujets — cliquez sur l'un d'eux. Pour parler à un humain, appuyez sur l'icône casque en haut ou tapez « agent ». 💬";

/** Sujets phares proposés en suggestions rapides. */
const FEATURED_TOPICS = HELP_TOPICS.filter((topic) => topic.featured);

export function HelpAssistant() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    WELCOME_MESSAGE,
  ]);
  const [isOnline, setIsOnline] = React.useState(true);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const idCounter = React.useRef(1);
  const typingTimeout = React.useRef<number | null>(null);

  // Le cloud n'est actif que si demandé ET si le navigateur est en ligne.
  const cloudActive = CLOUD_REQUESTED && isOnline;

  // Suivi de la connexion : bascule automatique local ↔ cloud.
  React.useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(window.navigator.onLine);

    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  // Nettoyage du minuteur « saisie en cours » au démontage.
  React.useEffect(() => {
    return () => {
      if (typingTimeout.current !== null) {
        window.clearTimeout(typingTimeout.current);
      }
    };
  }, []);

  // La touche Échap ferme la fenêtre.
  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Focus automatique du champ de saisie à l'ouverture.
  React.useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Défilement automatique vers le dernier message.
  React.useEffect(() => {
    const node = scrollRef.current;

    if (node) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping, open]);

  /** Ajoute un message bot après un délai (« saisie en cours »). */
  const queueBotMessage = React.useCallback(
    (draft: BotMessageDraft, delay: number) => {
      typingTimeout.current = window.setTimeout(() => {
        typingTimeout.current = null;
        idCounter.current += 1;
        const botMessageId = idCounter.current;

        setMessages((prev) => [
          ...prev,
          { ...draft, id: botMessageId, role: "bot" } as BotMessage,
        ]);
        setIsTyping(false);
      }, delay);
    },
    [],
  );

  /** Construit le message-guide local à partir d'un sujet de la base. */
  const buildLocalGuideMessage = React.useCallback(
    (
      topic: NonNullable<ReturnType<typeof findBestHelpTopic>>,
      cloudFallback: boolean,
    ): BotMessageDraft => ({
      text: topic.intro,
      steps: topic.steps,
      topicId: topic.id,
      route: topic.route,
      routeName: topic.routeName,
      source: "local",
      cloudFallback,
    }),
    [],
  );

  /** Affiche immédiatement la carte d'escalade humaine (bouton casque). */
  const showHumanSupport = React.useCallback(() => {
    if (isTyping) return;

    setIsTyping(true);

    if (typingTimeout.current !== null) {
      window.clearTimeout(typingTimeout.current);
    }

    queueBotMessage(
      {
        text: "Voici tous les moyens de joindre l'équipe humaine EduFlow — WhatsApp est le plus réactif :",
        humanSupport: true,
      },
      HUMAN_RESPONSE_DELAY_MS,
    );
  }, [isTyping, queueBotMessage]);

  /**
   * Contrôleur hybride : escalade humaine d'abord, cloud si activé et en
   * ligne, sinon (ou en cas d'échec) moteur de recherche flou local.
   */
  const handleSend = React.useCallback(
    async (rawText?: string) => {
      const text = (rawText ?? input).trim();

      if (!text || isTyping) return;

      setInput("");

      idCounter.current += 1;
      const userMessageId = idCounter.current;
      setMessages((prev) => [
        ...prev,
        { id: userMessageId, role: "user", text },
      ]);
      setIsTyping(true);

      if (typingTimeout.current !== null) {
        window.clearTimeout(typingTimeout.current);
        typingTimeout.current = null;
      }

      // 1) Escalade humaine : prioritaire sur toute recherche de guide.
      if (isHumanSupportRequest(text)) {
        queueBotMessage(
          {
            text: "Je vous mets en relation avec l'équipe humaine EduFlow 👤. Choisissez le canal qui vous arrange — WhatsApp reste le plus rapide :",
            humanSupport: true,
          },
          HUMAN_RESPONSE_DELAY_MS,
        );
        return;
      }

      // 2) Mode cloud (IA Gemini) : si activé et si le navigateur est en ligne.
      if (cloudActive) {
        const payload = await requestCloudReply(text);
        const cloudReply =
          typeof payload?.reply === "string" ? payload.reply.trim() : "";

        if (cloudReply) {
          const topic =
            typeof payload?.topicId === "string"
              ? getHelpTopicById(payload.topicId)
              : undefined;
          const cloudRoute =
            typeof payload?.route === "string" && payload.route.startsWith("/")
              ? payload.route
              : undefined;

          idCounter.current += 1;
          const botMessageId = idCounter.current;

          setMessages((prev) => [
            ...prev,
            {
              id: botMessageId,
              role: "bot",
              text: cloudReply,
              steps: topic?.steps,
              topicId: topic?.id,
              route: topic?.route ?? cloudRoute,
              routeName: topic?.routeName,
              source: "cloud",
            },
          ]);
          setIsTyping(false);
          return;
        }

        // 3) Repli : IA distante indisponible → moteur local.
        const fallbackTopic = findBestHelpTopic(text);

        queueBotMessage(
          fallbackTopic
            ? buildLocalGuideMessage(fallbackTopic, true)
            : {
                text: FALLBACK_TEXT,
                showSuggestions: true,
                source: "local",
                cloudFallback: true,
              },
          0,
        );
        return;
      }

      // 4) Mode local : recherche flou instantanée, 100 % hors ligne.
      const topic = findBestHelpTopic(text);

      queueBotMessage(
        topic
          ? buildLocalGuideMessage(topic, false)
          : { text: FALLBACK_TEXT, showSuggestions: true, source: "local" },
        LOCAL_RESPONSE_DELAY_MS,
      );
    },
    [input, isTyping, cloudActive, queueBotMessage, buildLocalGuideMessage],
  );

  /** Navigation directe vers la section expliquée (referme le widget). */
  const handleNavigate = React.useCallback(
    (route: string) => {
      setOpen(false);
      router.push(route);
    },
    [router],
  );

  return (
    <>
      {/* Bouton flottant « Besoin d'aide ? » */}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ouvrir l'assistant d'aide EduFlow"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-xl shadow-brand/40 ring-1 ring-white/20 transition-all hover:scale-105 hover:shadow-brand/50 hover:shadow-2xl active:scale-95"
        >
          <span className="relative flex size-5 items-center justify-center">
            <LifeBuoyIcon className="size-5" />
            <span className="absolute -right-1 -top-1 flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-mint opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-mint" />
            </span>
          </span>
          Besoin d&apos;aide ?
        </button>
      ) : null}

      {/* Fenêtre de discussion (glassmorphism sombre) */}
      {open ? (
        <div
          role="dialog"
          aria-label="Assistant d'aide EduFlow"
          className="fixed inset-x-3 bottom-3 z-50 flex h-[min(600px,calc(100dvh-1.5rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900/90 text-slate-100 shadow-2xl shadow-black/50 backdrop-blur-2xl animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[400px]"
        >
          {/* En-tête */}
          <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-brand/20 via-transparent to-mint/10 px-4 py-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-mint shadow-lg shadow-brand/40">
              <GraduationCapIcon className="size-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Assistant EduFlow</p>
              <p className="flex items-center gap-1.5 text-xs text-mint-light">
                <span
                  className={cn(
                    "size-1.5 animate-pulse rounded-full",
                    cloudActive ? "bg-mint" : "bg-amber-400",
                  )}
                />
                {cloudActive
                  ? "IA Gemini — réponses intelligentes"
                  : CLOUD_REQUESTED
                    ? "Hors ligne — guides intégrés"
                    : "Local — réponses instantanées"}
              </p>
            </div>
            <button
              type="button"
              onClick={showHumanSupport}
              aria-label="Parler à un agent humain"
              title="Parler à un humain"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card/10 hover:text-white"
            >
              <HeadsetIcon className="size-4.5" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer l'assistant"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card/10 hover:text-white"
            >
              <XIcon className="size-4.5" />
            </button>
          </div>

          {/* Fil de discussion */}
          <div
            ref={scrollRef}
            aria-live="polite"
            className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
          >
            {messages.map((message) => {
              if (message.role === "user") {
                return (
                  <div
                    key={message.id}
                    className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-brand to-brand-dark px-3.5 py-2 text-sm text-white shadow-md shadow-brand/30"
                  >
                    {message.text}
                  </div>
                );
              }

              const route = message.route;

              return (
                <div key={message.id} className="max-w-[95%] space-y-2.5">
                  {/* Bulle de réponse */}
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-mint shadow">
                      <SparklesIcon className="size-3 text-white" />
                    </span>
                    <div className="rounded-2xl rounded-tl-md border border-white/10 bg-card/5 px-3.5 py-2.5 text-sm leading-relaxed text-slate-200">
                      {message.text}
                    </div>
                  </div>

                  {/* Origine de la réponse (local / cloud) */}
                  {message.source ? (
                    <p className="ml-8 flex items-center gap-1 text-[10px] text-muted-foreground">
                      {message.source === "cloud" ? (
                        <>
                          <CloudIcon className="size-3 shrink-0 text-sky-400" />
                          Réponse IA (Gemini)
                        </>
                      ) : (
                        <>
                          <WifiOffIcon className="size-3 shrink-0 text-amber-400" />
                          {message.cloudFallback
                            ? "IA indisponible — guide local"
                            : "Guide local"}
                        </>
                      )}
                    </p>
                  ) : null}

                  {/* Carte d'escalade humaine */}
                  {message.humanSupport ? (
                    <HumanSupportCard className="ml-8" />
                  ) : null}

                  {/* Guide pas à pas */}
                  {message.steps ? (
                    <ol className="ml-8 space-y-1.5">
                      {message.steps.map((step, index) => (
                        <li
                          key={index}
                          className="flex items-start gap-2 text-xs leading-relaxed text-slate-300"
                        >
                          <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-mint/15 text-[9px] font-bold text-mint-light">
                            {index + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  ) : null}

                  {/* Maquette interactive (Generative UI) */}
                  {message.topicId ? (
                    <HelpUiPreview topic={message.topicId} className="ml-8" />
                  ) : null}

                  {/* Navigation directe */}
                  {route ? (
                    <div className="ml-8">
                      <button
                        type="button"
                        onClick={() => handleNavigate(route)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-mint to-brand px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-mint/25 transition-all hover:brightness-110 active:scale-[0.98]"
                      >
                        <NavigationIcon className="size-4" />
                        Aller directement à cette section
                        <ArrowRightIcon className="size-4" />
                      </button>
                      <p className="mt-1 text-center text-[10px] text-muted-foreground">
                        Destination : {message.routeName ?? "section"} ({route})
                      </p>
                    </div>
                  ) : null}

                  {/* Suggestions rapides */}
                  {message.showSuggestions ? (
                    <div className="ml-8 flex flex-col gap-1.5">
                      {FEATURED_TOPICS.map((topic) => (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => void handleSend(topic.question)}
                          className="flex items-center gap-2 rounded-xl border border-white/10 bg-card/5 px-3 py-2 text-left text-xs font-medium text-slate-200 transition-colors hover:border-brand-light/40 hover:bg-brand/20"
                        >
                          <topic.icon className="size-4 shrink-0 text-mint-light" />
                          {topic.question}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {/* Indicateur « saisie en cours » */}
            {isTyping ? (
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-mint shadow">
                  <SparklesIcon className="size-3 text-white" />
                </span>
                <div
                  aria-label="L'assistant rédige sa réponse"
                  className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-white/10 bg-card/5 px-3.5 py-3"
                >
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="size-1.5 animate-bounce rounded-full bg-slate-400"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Zone de saisie */}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
            className="flex items-center gap-2 border-t border-white/10 bg-card/5 p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Posez votre question…"
              aria-label="Votre question"
              className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-ink-800/80 px-3.5 text-sm text-slate-100 outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-light/60 focus:ring-2 focus:ring-brand/30"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              aria-label="Envoyer la question"
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-dark text-white shadow-lg shadow-brand/30 transition-all hover:brightness-110 active:scale-95",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              <SendIcon className="size-4.5" />
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
