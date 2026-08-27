import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// --------------------------------------
// Protection des routes (ex-middleware, renommé « proxy » en Next.js 16)
// --------------------------------------
//
// Matcher STRICT : le proxy ne s'exécute QUE sur /dashboard/:path*.
// Tout le reste (/, /login, /api, /_next, /favicon.ico, assets) est ignoré
// par le middleware et passe directement en NextResponse.next() — le proxy
// n'intervient JAMAIS ailleurs, sans AUCUNE redirection.
//   - /login est JAMAIS intercepté → aucune interférence possible avec la
//     logique de redirection de la page (auth() vs getToken() mismatch →
//     anciennement boucle /login ↔ /dashboard).
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
const DASHBOARD_PATH = "/dashboard";

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

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  let token = await resolveSessionToken(request);

  // --------------------------------------
  // Sessions inexistantes ou invalides
  // --------------------------------------
  if (!token) {
    // Utilisateur non authentifié tentant d'accéder au tableau de bord :
    // redirection vers la page de connexion en mémorisant la destination
    // initiale (callbackUrl) pour y revenir après connexion.
    if (pathname.startsWith(DASHBOARD_PATH)) {
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
  // Session JWT valide : contrôle d'accès par rôle sur /dashboard
  // --------------------------------------
  // Règle stricte : le proxy ne protège QUE /dashboard/* (voir matcher
  // ci-dessous) et ne redirige JAMAIS /login → /dashboard. La page /login
  // n'effectue aucune redirection serveur (voir src/app/login/page.tsx) :
  // cela casse définitivement la boucle /login ↔ /dashboard
  // (ERR_TOO_MANY_REDIRECTS). Toute autre route → NextResponse.next().

  // Contrôle d'accès par rôle sur /dashboard
  if (pathname.startsWith(DASHBOARD_PATH)) {
    const role = typeof token.role === "string" ? token.role : null;

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

export const config = {
  // Matcher STRICT : le proxy ne s'exécute QUE sur /dashboard/*.
  // Tout le reste (/, /login, /api, /_next, /favicon.ico, assets) est ignoré
  // par le middleware et passe directement en NextResponse.next() — le proxy
  // n'intervient JAMAIS ailleurs, sans AUCUNE redirection. Cette exclusion
  // stricte de /login casse la boucle infinie sur Vercel :
  // /dashboard → /login → /dashboard → … (ERR_TOO_MANY_REDIRECTS), liée à un
  // désaccord entre getToken() (proxy) et auth() (page /login). La page /login
  // n'effectue plus, elle-même, aucune redirection serveur → /dashboard.
  matcher: ["/dashboard/:path*"],
};