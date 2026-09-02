// --------------------------------------
// Route d'administration Super-Admin (URL obfusquée)
// --------------------------------------
//
// Le back-office plateforme n'est plus exposé sous `/super-admin` : tout accès
// à ce chemin hérité renvoie une erreur 404 (voir
// `src/app/super-admin/[[...rest]]/page.tsx`). La route réelle est une URL
// d'administration non devinable, personnalisable via la variable
// d'environnement `NEXT_PUBLIC_SUPER_ADMIN_ROUTE` (défaut :
// `/portal-sys-admin-sec`).
//
// Ce module est volontairement « client-safe » (aucune dépendance serveur) :
// il est importable à la fois par le proxy (`src/proxy.ts`), les Server
// Components (`src/app/dashboard/page.tsx`), les Server Actions
// (`src/actions/super-admin.ts`) et les composants clients (sidebar).

/**
 * Chemin par défaut du back-office Super-Admin (obfusqué). Doit rester
 * synchronisé avec le nom du segment de route `src/app/portal-sys-admin-sec`.
 */
export const DEFAULT_SUPER_ADMIN_ROUTE = "/portal-sys-admin-sec";

/** Chemin hérité, volontairement retiré : toute requête doit renvoyer 404. */
export const LEGACY_SUPER_ADMIN_ROUTE = "/super-admin";

/**
 * Normalise une valeur de route administrateur saisie en variable
 * d'environnement : slash initial garanti, slash final retiré, et rejet des
 * valeurs dangereuses ou absurdes (`/`, `/super-admin`, chemins vides).
 * Retourne `null` si la valeur n'est pas exploitable.
 */
function normalizeAdminRoute(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();

  if (!trimmed) {
    return null;
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const route = withLeadingSlash.replace(/\/+$/, "");

  if (
    !route ||
    route === "/" ||
    route === LEGACY_SUPER_ADMIN_ROUTE ||
    route === "/login" ||
    route === "/dashboard" ||
    route === "/api"
  ) {
    return null;
  }

  return route;
}

/**
 * Route publique du back-office Super-Admin :
 * `process.env.NEXT_PUBLIC_SUPER_ADMIN_ROUTE` si elle est fournie (et
 * exploitable), sinon `DEFAULT_SUPER_ADMIN_ROUTE`.
 *
 * NOTE (build) : les variables `NEXT_PUBLIC_*` sont inlinées au moment du
 * build — modifier la route impose un redéploiement (et, pour le garde JWT du
 * proxy dont le matcher est statique, l'ajout du chemin configuré ; le
 * mécanisme de rewrite de `next.config.ts` fait ensuite le pont vers le
 * segment de route interne).
 */
export function getSuperAdminRoute(): string {
  return normalizeAdminRoute(process.env.NEXT_PUBLIC_SUPER_ADMIN_ROUTE) ?? DEFAULT_SUPER_ADMIN_ROUTE;
}

/**
 * Construit un chemin sous la route administrateur configurée
 * (`superAdminPath()` → racine, `superAdminPath("pricing")` → « …/pricing »).
 */
export function superAdminPath(...segments: readonly string[]): string {
  const base = getSuperAdminRoute();
  const suffix = segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");

  return suffix ? `${base}/${suffix}` : base;
}

/** `true` si `pathname` pointe vers la route administrateur configurée. */
export function isSuperAdminRoutePath(pathname: string): boolean {
  const route = getSuperAdminRoute();
  return pathname === route || pathname.startsWith(`${route}/`);
}
