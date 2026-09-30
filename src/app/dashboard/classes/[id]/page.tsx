import { redirect } from "next/navigation";

/**
 * Vue de classe UNIFIÉE.
 *
 * La seconde vue de classe détaillée n'existe plus : tout accès à une classe
 * (lien de la liste des classes, menu, historique, lien direct) est
 * redirigé vers la page unique « Présences & Cahier de texte », qui porte la
 * classe sélectionnée via `?classId=…`.
 *
 * Le 307 est volontaire : l'URL reste partageable / rechargeable, et
 * `/dashboard/classes/[id]` demeure un point d'entrée stable.
 */
export default async function ClassDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  redirect(`/dashboard/attendance?classId=${encodeURIComponent(id)}`);
}