"use client";

// ---------------------------------------------------------------------------
// ContactForm — formulaire de contact de la page /contact.
// La soumission est traitée par la Server Action `submitContactFormAction`
// (src/actions/contact.ts), qui valide les champs côté serveur puis relaie le
// message vers l'adresse interne de l'équipe (CONTACT_EMAIL_TO).
//
// ⚠️ Aucune adresse e-mail n'est exposée au visiteur : la confirmation invite
// à poursuivre par téléphone ou WhatsApp (source de vérité :
// `@/data/contact-channels`).
// ---------------------------------------------------------------------------

import { useActionState, useEffect, useState } from "react";
import {
  CheckCircle2,
  MessageCircle,
  Phone,
  Send,
  TriangleAlert,
} from "lucide-react";

import {
  submitContactFormAction,
  type ContactFormState,
} from "@/actions/contact";
import {
  buildContactWhatsAppUrl,
  CONTACT_PHONE_CHANNELS,
  CONTACT_SUBJECT_LABELS,
  CONTACT_SUBJECT_VALUES,
} from "@/data/contact-channels";

/** Styles partagés des champs (thème « glassmorphism » du landing). */
const inputClass =
  "w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-light focus:ring-1 focus:ring-brand-light transition-colors";

/** Style du message d'erreur affiché sous un champ invalide. */
const errorClass = "text-xs text-red-400 mt-1.5";

/** État initial du formulaire (`useActionState`). */
const INITIAL_STATE: ContactFormState = { status: "idle" };

export default function ContactForm() {
  const [state, formAction, pending] = useActionState(
    submitContactFormAction,
    INITIAL_STATE
  );

  /** Horodatage de montage, transmis en champ caché (garde anti-robot). */
  const [renderedAt, setRenderedAt] = useState<number>(0);

  useEffect(() => {
    setRenderedAt(Date.now());
  }, []);

  // Écran de confirmation après soumission
  if (state.status === "success") {
    return (
      <div className="flex flex-col items-center text-center py-10">
        <CheckCircle2 className="w-12 h-12 text-mint mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">
          Message envoyé !
        </h3>
        <p className="text-sm text-gray-400 max-w-sm mb-6">
          {state.message ??
            "Merci de nous avoir contactés. Notre équipe vous répondra sous 24 h ouvrées."}
        </p>

        {/* Alternatives immédiates : téléphone / WhatsApp (aucun e-mail exposé). */}
        <div className="w-full max-w-md space-y-3">
          {CONTACT_PHONE_CHANNELS.map((phone) => (
            <div
              key={phone.telHref}
              className="flex flex-col sm:flex-row sm:items-center gap-2"
            >
              <a
                href={phone.telHref}
                className="flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm rounded-xl bg-brand hover:bg-brand-dark text-white border border-white/10 transition-all hover:shadow-lg hover:shadow-brand/25"
              >
                <Phone className="w-4 h-4" />
                Appeler {phone.display}
              </a>
              <a
                href={buildContactWhatsAppUrl(phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#4ade80] border border-[#25D366]/30 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp {phone.country}
              </a>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setRenderedAt(Date.now())}
          className="mt-6 px-4 py-2 text-sm rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/10 transition-colors"
        >
          Envoyer un autre message
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* Garde anti-robots : champ invisible, jamais rempli par un humain. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="contact-website">Site web</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
        {/* Horodatage de montage (temporisation anti-robot). */}
        <input type="hidden" name="renderedAt" value={renderedAt} />
      </div>

      {/* Message d'erreur global (validation ou échec d'envoi). */}
      {state.status === "error" && state.message && (
        <div
          role="alert"
          className="flex items-start gap-2 px-4 py-3 text-sm rounded-lg bg-red-500/10 border border-red-500/30 text-red-300"
        >
          <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{state.message}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="contact-name"
            className="block text-sm font-medium text-gray-300 mb-1.5"
          >
            Nom complet <span className="text-brand-light">*</span>
          </label>
          <input
            id="contact-name"
            name="name"
            type="text"
            required
            maxLength={120}
            placeholder="Votre nom"
            aria-invalid={Boolean(state.fieldErrors?.name)}
            className={inputClass}
          />
          {state.fieldErrors?.name && (
            <p className={errorClass}>{state.fieldErrors.name}</p>
          )}
        </div>
        <div>
          <label
            htmlFor="contact-email"
            className="block text-sm font-medium text-gray-300 mb-1.5"
          >
            Email <span className="text-brand-light">*</span>
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            maxLength={200}
            placeholder="vous@exemple.com"
            aria-invalid={Boolean(state.fieldErrors?.email)}
            className={inputClass}
          />
          {state.fieldErrors?.email && (
            <p className={errorClass}>{state.fieldErrors.email}</p>
          )}
        </div>
      </div>

      <div>
        <label
          htmlFor="contact-organization"
          className="block text-sm font-medium text-gray-300 mb-1.5"
        >
          Centre / Organisation
        </label>
        <input
          id="contact-organization"
          name="organization"
          type="text"
          maxLength={150}
          placeholder="Nom de votre centre (facultatif)"
          aria-invalid={Boolean(state.fieldErrors?.organization)}
          className={inputClass}
        />
        {state.fieldErrors?.organization && (
          <p className={errorClass}>{state.fieldErrors.organization}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="contact-subject"
          className="block text-sm font-medium text-gray-300 mb-1.5"
        >
          Sujet <span className="text-brand-light">*</span>
        </label>
        <select
          id="contact-subject"
          name="subject"
          required
          defaultValue=""
          aria-invalid={Boolean(state.fieldErrors?.subject)}
          className={`${inputClass} [&>option]:bg-ink-800 [&>option]:text-white`}
        >
          <option value="" disabled>
            Choisissez un sujet
          </option>
          {CONTACT_SUBJECT_VALUES.map((value) => (
            <option key={value} value={value}>
              {CONTACT_SUBJECT_LABELS[value]}
            </option>
          ))}
        </select>
        {state.fieldErrors?.subject && (
          <p className={errorClass}>{state.fieldErrors.subject}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="contact-message"
          className="block text-sm font-medium text-gray-300 mb-1.5"
        >
          Message <span className="text-brand-light">*</span>
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={5}
          maxLength={4000}
          placeholder="Décrivez votre demande…"
          aria-invalid={Boolean(state.fieldErrors?.message)}
          className={`${inputClass} resize-none`}
        />
        {state.fieldErrors?.message && (
          <p className={errorClass}>{state.fieldErrors.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium bg-brand hover:bg-brand-dark text-white transition-all hover:shadow-lg hover:shadow-brand/25 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:shadow-none"
      >
        {pending ? (
          <>
            <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            Envoi en cours…
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Envoyer le message
          </>
        )}
      </button>

      <p className="text-xs text-gray-500 text-center">
        En envoyant ce formulaire, vous acceptez notre{" "}
        <a
          href="/politique-de-confidentialite"
          className="text-brand-light hover:underline"
        >
          politique de confidentialité
        </a>
        .
      </p>
    </form>
  );
}
