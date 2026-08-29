import { prisma } from "@/lib/prisma";

// --------------------------------------
// Slug d'organisation (unicité globale)
// --------------------------------------
//
// Utilisé par l'onboarding Google (src/auth.ts) : la première connexion
// Google d'un administrateur crée automatiquement son organisation ; le slug
// dérivé du nom doit être unique globalement (contrainte `@unique` sur
// `Organization.slug`).

/** Caractères autorisés dans un slug (a-z, chiffres, tirets). */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    // Supprime les accents (é → e, ç → c…).
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Génère un slug d'organisation unique à partir d'un nom libre.
 * En cas de collision, un suffixe numérique incrémental est ajouté
 * (`mon-centre`, `mon-centre-2`, `mon-centre-3`…).
 */
export async function generateUniqueOrganizationSlug(
  name: string
): Promise<string> {
  const base = slugify(name) || "organisation";

  // Réservation du slug de base si disponible (cas le plus fréquent).
  const baseTaken = await prisma.organization.findUnique({
    where: { slug: base },
    select: { id: true },
  });

  if (!baseTaken) {
    return base;
  }

  // Sinon : incrément jusqu'à trouver un slug libre (boucle bornée).
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    const taken = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!taken) {
      return candidate;
    }
  }

  // Repli quasi-impossible : suffixe aléatoire long.
  return `${base}-${Date.now().toString(36)}`;
}
