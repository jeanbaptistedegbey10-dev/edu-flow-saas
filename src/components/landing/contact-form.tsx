"use client";

// ---------------------------------------------------------------------------
// ContactForm — formulaire de contact de la page /contact.
// Aucun backend n'est branché : la soumission affiche une confirmation côté
// client et invite à écrire directement à contact@eduflow.com.
// ---------------------------------------------------------------------------

import { useState, type FormEvent } from "react";
import { CheckCircle2, Send } from "lucide-react";

/** Styles partagés des champs (thème « glassmorphism » du landing). */
const inputClass =
  "w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-brand-light focus:ring-1 focus:ring-brand-light transition-colors";

export default function ContactForm() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
  };

  // Écran de confirmation après soumission
  if (submitted) {
    return (
      <div className="flex flex-col items-center text-center py-10">
        <CheckCircle2 className="w-12 h-12 text-mint mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">
          Message envoyé !
        </h3>
        <p className="text-sm text-gray-400 max-w-sm">
          Merci de nous avoir contactés. Notre équipe vous répondra sous 24 h
          ouvrées. Pour une réponse immédiate, écrivez-nous directement à{" "}
          <a
            href="mailto:contact@eduflow.com"
            className="text-brand-light hover:underline"
          >
            contact@eduflow.com
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-6 px-4 py-2 text-sm rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/10 transition-colors"
        >
          Envoyer un autre message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
            placeholder="Votre nom"
            className={inputClass}
          />
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
            placeholder="vous@exemple.com"
            className={inputClass}
          />
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
          placeholder="Nom de votre centre (facultatif)"
          className={inputClass}
        />
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
          className={`${inputClass} [&>option]:bg-ink-800 [&>option]:text-white`}
        >
          <option value="" disabled>
            Choisissez un sujet
          </option>
          <option value="demo">Demande de démonstration</option>
          <option value="pricing">Tarifs et abonnement</option>
          <option value="support">Support technique</option>
          <option value="partnership">Partenariat</option>
          <option value="other">Autre demande</option>
        </select>
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
          placeholder="Décrivez votre demande…"
          className={`${inputClass} resize-none`}
        />
      </div>

      <button
        type="submit"
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium bg-brand hover:bg-brand-dark text-white transition-all hover:shadow-lg hover:shadow-brand/25"
      >
        <Send className="w-4 h-4" />
        Envoyer le message
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
