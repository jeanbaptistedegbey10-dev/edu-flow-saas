import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, MessageCircle, Phone } from "lucide-react";
import PageShell from "@/components/landing/page-shell";
import ContactForm from "@/components/landing/contact-form";
import {
  buildContactWhatsAppUrl,
  CONTACT_HOURS,
  CONTACT_PHONE_CHANNELS,
} from "@/data/contact-channels";

export const metadata: Metadata = {
  title: "Contact - EduFlow",
  description:
    "Contactez l'équipe EduFlow : démonstration, tarifs, support technique. Réponse sous 24 h ouvrées.",
};

/** Horaires du support, affichés sous chaque numéro. */
const SUPPORT_HOURS = CONTACT_HOURS;

export default function ContactPage() {
  return (
    <PageShell
      badge="Nous contacter"
      title="Parlons de votre centre"
      description="Une question sur EduFlow, une demande de démonstration ou un besoin d'assistance ? Notre équipe vous répond sous 24 h ouvrées."
    >
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Coordonnées */}
        <div className="lg:col-span-2 space-y-4">
          {/* Téléphones officiels : appel direct + WhatsApp prérempli.
              Aucune adresse e-mail publique n'est exposée : le formulaire
              ci-contre relaie les messages vers l'adresse interne. */}
          {CONTACT_PHONE_CHANNELS.map((phone) => (
            <div key={phone.telHref} className="glass-card p-5">
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-brand/10 border border-brand/20 shrink-0">
                  <Phone className="w-5 h-5 text-brand-light" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-white">
                    Téléphone — {phone.country}
                  </p>
                  <a
                    href={phone.telHref}
                    className="block text-sm text-brand-light hover:underline break-all"
                  >
                    {phone.display}
                  </a>
                  <p className="text-xs text-gray-500">{SUPPORT_HOURS}</p>
                </div>
              </div>

              {/* Deux actions interactives par numéro. */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <a
                  href={phone.telHref}
                  className="flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand hover:bg-brand-dark text-white transition-all hover:shadow-lg hover:shadow-brand/25"
                >
                  <Phone className="w-4 h-4" />
                  Appeler
                </a>
                <a
                  href={buildContactWhatsAppUrl(phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#4ade80] border border-[#25D366]/30 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </a>
              </div>
            </div>
          ))}

          {/* Adresse */}
          <div className="glass-card p-5 flex items-start gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-brand/10 border border-brand/20 shrink-0">
              <MapPin className="w-5 h-5 text-brand-light" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-white">Adresse</p>
              <p className="text-sm text-brand-light break-all">
                Cotonou, Bénin
              </p>
              <p className="text-xs text-gray-500">
                Sur rendez-vous uniquement
              </p>
            </div>
          </div>

          {/* Renvoi vers la FAQ du landing */}
          <div className="glass-card p-5 flex items-start gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-mint/10 border border-mint/20 shrink-0">
              <MessageCircle className="w-5 h-5 text-mint" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">
                Questions fréquentes
              </p>
              <p className="text-sm text-gray-400">
                La réponse à votre question se trouve peut-être déjà dans{" "}
                <Link
                  href="/#faq"
                  className="text-brand-light hover:underline"
                >
                  la FAQ
                </Link>
                .
              </p>
            </div>
          </div>
        </div>

        {/* Formulaire */}
        <div className="lg:col-span-3">
          <div className="glass-card p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-white mb-1">
              Envoyez-nous un message
            </h2>
            <p className="text-sm text-gray-400 mb-6">
              Les champs marqués d&apos;un astérisque (*) sont obligatoires.
            </p>
            <ContactForm />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
