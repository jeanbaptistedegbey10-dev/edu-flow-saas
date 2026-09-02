import type { Metadata } from "next";
import { notFound } from "next/navigation";

// --------------------------------------
// Route héritée `/super-admin` — DÉSACTIVÉE VOLONTAIREMENT
// --------------------------------------
//
// Le back-office Super-Admin a été déplacé vers une URL d'administration
// obfusquée (par défaut `/portal-sys-admin-sec`, configurable via
// `NEXT_PUBLIC_SUPER_ADMIN_ROUTE` — voir `src/lib/super-admin-route.ts`).
//
// Ce catch-all optionnel (`[[...rest]]`) couvre `/super-admin` ET
// `/super-admin/<n'importe quel sous-chemin>` : chaque tentative d'accès
// renvoie la page 404 de l'application avec le statut HTTP 404 réel — aucune
// redirection (qui trahirait l'existence d'un espace protégé), aucun contenu.
//
// La page 404 est servie INDIFFÉREMMENT aux utilisateurs connectés (même
// Super Admin), non connectés et non authentifiés : le chemin hérité est
// totalement mort.

export const metadata: Metadata = {
  title: "404 — Page introuvable | EduFlow",
  robots: { index: false, follow: false },
};

export default function LegacySuperAdminPage() {
  notFound();
}
