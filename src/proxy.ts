import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import {
  DEFAULT_SUPER_ADMIN_ROUTE,
  getSuperAdminRoute,
  isSuperAdminRoutePath,
} from "@/lib/super-admin-route";

// --------------------------------------
// Protection des routes (ex-middleware, renommé « proxy » en Next.js 16)
// --------------------------------------
//
// Matcher STRICT : le proxy ne s'exécute QUE sur /dashboard/:path* et sur la
// route d'administration obfusquée (par défaut /portal-sys-admin-sec/:path*).
// Tout le reste (/, /login, /api, /_next, /favicon.ico, assets) est ignoré
// par le middleware et passe directement en NextResponse.next() — le proxy
// n'intervient JAMAIS ailleurs, sans AUCUNE redirection.
//   - /login est JAMAIS intercepté → aucune interférence possible avec la
//     logique de redirection de la page (auth() vs getToken() mismatch →
//     anciennement boucle /login ↔ /dashboard).
//   - /super-admin (route héritée) n'est PLUS couvert par le matcher : la
//     requête atteint directement la page `[[...rest]]` qui renvoie un 404
//     réel (aucune redirection, aucun contenu, statut HTTP 404).
//   - Les endpoints NextAuth (/api/auth/*) et les assets statiques ne sont
//     jamais interceptés.
//   - La page /login n'effectue elle-même aucune redirection serveur →
//     /dashboard (voir src/app/login/page.tsx) : la boucle est cassée.
//
// Logique de redirection :
//   - /dashboard/* : si !token → redirect /login (avec callbackUrl) + nettoyage
//     cookie invalide (cas qui brise la boucle de redirection).
//   - /login       : exclue du matcher ET aucune redirection serveur → /dashboard
//     (voir src/app/login/page.tsx) : la page affiche toujours le formulaire,
//     ce qui casse définitivement la boucle /login ↔ /dashboard.
//   - Cookies invalides : nettoyés uniquement lors de la redirection vers /login.
//
// - Rôle STUDENT : aucun accès au tableau de bord (aucun compte étudiant prévu).
// - Rôle TEACHER : accès restreint aux modules pédagogiques ; toutes les
//   données financières (paiements, voyages, dépenses, POS) sont masquées.
// La vérification s'appuie sur le token JWT de session (stratégie JWT),
// sans accès base de données : le fichier reste léger et rapide.

const LOGIN_PATH = "/login";
const HOME_PATH = "/";
const DASHBOARD_PATH = "/dashboard";

/**
 * Cookie de parrainage : posé quand un visiteur arrive avec `?ref=CODE` sur
 * l'accueil ou la page d'inscription. Consommé (puis supprimé) par le
 * callback `signIn` (src/auth.ts) lors de la création du compte filleul.
 */
const REFERRAL_COOKIE_NAME = "eduflow_ref";
/** Durée de vie du cookie de parrainage : 90 jours (en secondes). */
const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;
/**
 * Landing publique : déplacée de `/` vers `/accueil` à l'Étape 2 (la racine
 * affiche désormais le hub modulaire du tableau de bord).
 */
const LANDING_PATH = "/accueil";
/** Chemins sur lesquels le paramètre `?ref=` est capturé par le proxy. */
const REFERRAL_TRACKED_PATHS: readonly string[] = [
  HOME_PATH,
  LANDING_PATH,
  "/register",
];

/**
 * Route d'administration obfusquée (NEXT_PUBLIC_SUPER_ADMIN_ROUTE,
 * défaut `/portal-sys-admin-sec`). Les variables NEXT_PUBLIC_* sont inlinées
 * au build : la valeur est donc figée au déploiement — cohérente avec le
 * matcher statique ci-dessous.
 */
const SUPER_ADMIN_ROUTE = getSuperAdminRoute();


/**
 * Noms des cookies de session émis par Auth.js v5 (NextAuth) :
 * - `authjs.session-token` en HTTP ;
 * - `__Secure-authjs.session-token` en HTTPS.
 */
const SESSION_COOKIE_NAMES: readonly string[] = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

/**
 * Résout le JWT de session côté proxy.
 *
 * Auth.js v5 (`@auth/core`) écrit le cookie de session avec le préfixe
 * `__Secure-` dès que `useSecureCookies` est actif, ce qui est auto-détecté à
 * partir de l'URL (`url.protocol === "https:"`, voir init.js) : sur Vercel le
 * cookie est donc `__Secure-authjs.session-token`.
 *
 * Or `getToken()` (`@auth/core/jwt`) utilise par défaut `secureCookie ?? false`,
 * soit cookie `authjs.session-token` NON préfixé. En production (HTTPS) il ne
 * lit donc JAMAIS le cookie `__Secure-` → token = null → redirection
 * /login?callbackUrl=/dashboard. C'est la cause racine du bug signalé.
 *
 * On tente donc les deux variantes (sans puis avec préfixe). On fournit
 * explicitement `cookieName` : en plus de pointer le bon cookie, `getToken`
 * l'utilise comme `salt` de dérivation de clé (valeur par défaut), ce qui
 * correspond exactement au `salt` choisi à l'écriture
 * (`options.cookies.sessionToken.name`, cf. lib/actions/callback/*.js).
 * `secureCookie:true` ajoute de plus l'attribut `Secure` au cookie lu.
 */
async function resolveSessionToken(request: NextRequest) {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

  if (!secret) {
    return null;
  }

  for (const secureCookie of [false, true] as const) {
    const cookieName = `${secureCookie ? "__Secure-" : ""}authjs.session-token`;
    try {
      const token = await getToken({
        req: request,
        secret,
        secureCookie,
        cookieName,
      });
      if (token) {
        return token;
      }
    } catch {
      // Cookie corrompu / signature invalide : on essaie l'autre variante.
    }
  }

  return null;
}

/**
 * Routes interdites aux enseignants : gestion financière, dossiers
 * administratifs et configuration de l'organisation. Un enseignant ne voit
 * que ses cours, ses émargements et ses cahiers de texte (+ tâches/calendrier).
 */
const TEACHER_FORBIDDEN_PREFIXES: readonly string[] = [
  "/dashboard/payments",
  "/dashboard/echeances",
  "/dashboard/archives",
  "/dashboard/travels",
  "/dashboard/expenses",
  "/dashboard/pos",
  "/dashboard/students",
  "/dashboard/organization",
  "/dashboard/settings",
];

/**
 * Détruit les cookies de session invalides sur la réponse lorsque le navigateur
 * en a envoyé un alors qu'aucun token valide n'a pu être résolu. Sans ce
 * nettoyage, le cookie fantôme serait renvoyé indéfiniment et pourrait
 * alimenter des boucles de redirection côté application.
 */
function clearInvalidSessionCookies(
  response: NextResponse,
  request: NextRequest
): NextResponse {
  // Collecte les noms de cookies de session potentiellement invalides,
  // y compris les entrées chunkées (`__Secure-authjs.session-token.0`, `.1`…)
  // afin de détruire tous les fragments d'une session obsolète.
  const staleNames = request.cookies
    .getAll()
    .map((c) => c.name)
    .filter((name) =>
      SESSION_COOKIE_NAMES.some(
        (base) => name === base || name.startsWith(`${base}.`)
      )
    );

  if (staleNames.length > 0) {
    for (const name of staleNames) {
      response.cookies.delete(name);
    }
  }

  return response;
}

async function handleProxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = await resolveSessionToken(request);

  // --------------------------------------
  // Sessions inexistantes ou invalides
  // --------------------------------------
  if (!token) {
    // Utilisateur non authentifié tentant d'accéder au tableau de bord :
    // redirection vers la page de connexion en mémorisant la destination
    // initiale (callbackUrl) pour y revenir après connexion.
    if (pathname.startsWith(DASHBOARD_PATH) || pathname.startsWith(SUPER_ADMIN_ROUTE)) {
      const loginUrl = new URL(LOGIN_PATH, request.url);
      loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);

      return clearInvalidSessionCookies(
        NextResponse.redirect(loginUrl),
        request
      );
    }

    // Routes publiques : aucune redirection, aucun nettoyage de cookie.
    // Le cookie invalide n'est détruit QUE lors de la redirection vers /login
    // (cas dashboard ci-dessus) — cela brise la boucle sans déconnecter
    // brutalement un utilisateur dont le cookie est temporairement illisible.
    return NextResponse.next();
  }

  // --------------------------------------
  // Super-Admin : espace de travail = route administrateur obfusquée
  // --------------------------------------
  // Un utilisateur ayant le rôle SUPER_ADMIN ne doit JAMAIS atterrir sur
  // l'accueil (`/`) ni sur le tableau de bord d'un centre de formation
  // client (/dashboard*) : il est renvoyé vers son back-office (route
  // obfusquée, par défaut /portal-sys-admin-sec).
  // Aucun risque de boucle : on ne redirige QUE depuis `/` et `/dashboard`.
  const role = typeof token.role === "string" ? token.role : null;

  if (
    role === "SUPER_ADMIN" &&
    (pathname === HOME_PATH || pathname.startsWith(DASHBOARD_PATH))
  ) {
    return NextResponse.redirect(new URL(SUPER_ADMIN_ROUTE, request.url));
  }

  // --------------------------------------
  // Back-office Super-Admin : réservé au rôle SUPER_ADMIN
  // --------------------------------------
  // Première barrière (JWT, sans accès base de données) : tout utilisateur
  // authentifié qui n'est pas SUPER_ADMIN — en particulier les administrateurs
  // d'écoles classiques — est renvoyé vers son tableau de bord sans qu'aucune
  // information du back-office ne soit divulguée. La deuxième barrière
  // (relecture du rôle en base) vit dans src/lib/super-admin.ts et dans
  // chaque Server Action de src/actions/super-admin.ts.
  if (isSuperAdminRoutePath(pathname)) {
    if (role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL(DASHBOARD_PATH, request.url));
    }

    return NextResponse.next();
  }

  // --------------------------------------
  // Route interne par défaut : masquée si la route est personnalisée
  // --------------------------------------
  // Si NEXT_PUBLIC_SUPER_ADMIN_ROUTE pointe vers un autre chemin, le segment
  // de route interne (par défaut /portal-sys-admin-sec) ne doit PAS rester
  // joignable : toute requête est réécrite vers /super-admin — la page
  // [[...rest]] renvoie alors un 404 réel.
  if (
    SUPER_ADMIN_ROUTE !== DEFAULT_SUPER_ADMIN_ROUTE &&
    (pathname === DEFAULT_SUPER_ADMIN_ROUTE ||
      pathname.startsWith(`${DEFAULT_SUPER_ADMIN_ROUTE}/`))
  ) {
    return NextResponse.rewrite(new URL("/super-admin", request.url));
  }

  // --------------------------------------
  // Session JWT valide : contrôle d'accès par rôle sur /dashboard
  // --------------------------------------
  // Règle stricte : le proxy ne protège QUE /dashboard/* (voir matcher
  // ci-dessous) et ne redirige JAMAIS /login → /dashboard. La page /login
  // n'effectue aucune redirection serveur (voir src/app/login/page.tsx) :
  // cela casse définitivement la boucle /login ↔ /dashboard
  // (ERR_TOO_MANY_REDIRECTS). Toute autre route → NextResponse.next().

  // Contrôle d'accès par rôle sur /dashboard
  if (pathname.startsWith(DASHBOARD_PATH)) {

    // ---------------------------------------------------------------
    // Vue de classe UNIFIÉE
    // ---------------------------------------------------------------
    // L'ancienne fiche de classe détaillée n'existe plus : tout accès à
    // `/dashboard/classes/<id>` est redirigé vers la page unique
    // « Présences & Cahier de texte », qui porte la classe via
    // `?classId=…`.
    //
    // La redirection est effectuée ICI, dans le proxy, et non dans la page :
    // le layout du tableau de bord commençant à diffuser le document avant que
    // la page ne soit résolue, un `redirect()` côté page se traduisait par un
    // `<meta http-equiv="refresh">` (retour 200 + délai d'une seconde) au lieu
    // d'une vraie redirection HTTP. Depuis le proxy, on obtient un vrai 307,
    // sans rendu inutile du layout.
    //
    // La route `/dashboard/classes/<id>/close` (écran de clôture) reste
    // ATTEIGNABLE : seule la fiche de classe est redirigée.
    const unifiedClassMatch = /^\/dashboard\/classes\/([^/]+)$/.exec(pathname);

    if (unifiedClassMatch) {
      const target = new URL("/dashboard/attendance", request.url);
      target.searchParams.set("classId", unifiedClassMatch[1]);

      return NextResponse.redirect(target);
    }

    // AUCUN accès au tableau de bord pour les étudiants :
    // ils ne disposent d'aucun compte dans cette application.
    if (role === "STUDENT") {
      return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
    }

    // Les enseignants n'ont accès à aucune donnée financière ni
    // administrative : redirection vers leur espace pédagogique.
    if (role === "TEACHER") {
      const isForbidden = TEACHER_FORBIDDEN_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      );

      if (isForbidden) {
        return NextResponse.redirect(
          new URL("/dashboard/attendance", request.url)
        );
      }
    }
  }

  return NextResponse.next();
}

/**
 * Point d'entrée du proxy (Next.js 16, ex-middleware).
 *
 * Délègue la logique d'accès à `handleProxy`, puis capture le paramètre
 * `?ref=CODE` sur l'accueil et la page d'inscription pour persister le cookie
 * de parrainage `eduflow_ref` (90 jours). Le cookie est posé sur TOUTE réponse
 * (next ou redirection) afin de survivre au flux OAuth Google — le callback
 * `signIn` (src/auth.ts) le consomme à la création du compte filleul.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const response = await handleProxy(request);

  const { pathname } = request.nextUrl;
  const refCode = request.nextUrl.searchParams.get("ref")?.trim();

  if (refCode && REFERRAL_TRACKED_PATHS.includes(pathname)) {
    response.cookies.set(REFERRAL_COOKIE_NAME, refCode, {
      path: "/",
      maxAge: REFERRAL_COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  // Matcher STRICT : le proxy ne s'exécute QUE sur /dashboard/* et sur la
  // route d'administration obfusquée (par défaut /portal-sys-admin-sec/*),
  // plus l'accueil `/` (intercepté uniquement pour la redirection
  // Super-Admin → back-office ; les non-connectés y sont laissés tels quels)
  // et la landing `/accueil` (capture du cookie de parrainage `?ref=`).
  //
  // Le matcher doit être une CONSTANTE statique (analyse au build) : si
  // NEXT_PUBLIC_SUPER_ADMIN_ROUTE est personnalisé, ajoutez le chemin
  // configuré ici ; le rewrite de next.config.ts fait ensuite le pont vers
  // le segment de route interne, protégé par la barrière DB du layout.
  //
  // /super-admin (route héritée) est volontairement ABSENT du matcher : la
  // requête atteint directement src/app/super-admin/[[...rest]]/page.tsx qui
  // renvoie un 404 réel — pour tout le monde, y compris les Super Admins.
  //
  // Tout le reste (/login, /api, /_next, /favicon.ico, assets) est ignoré
  // par le middleware et passe directement en NextResponse.next() — le proxy
  // n'intervient JAMAIS ailleurs, sans AUCUNE redirection. Cette exclusion
  // stricte de /login casse la boucle infinie sur Vercel :
  // /dashboard → /login → /dashboard → … (ERR_TOO_MANY_REDIRECTS), liée à un
  // désaccord entre getToken() (proxy) et auth() (page /login). La page /login
  // n'effectue plus, elle-même, aucune redirection serveur → /dashboard.
  matcher: ["/", "/accueil", "/register", "/dashboard/:path*", "/portal-sys-admin-sec/:path*"],
};