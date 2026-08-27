import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// --------------------------------------
// Protection des routes (ex-middleware, renommé « proxy » en Next.js 16)
// --------------------------------------
//
// - /dashboard/* : redirige vers /login si l'utilisateur n'est pas authentifié.
// - /login       : n'émet AUCUNE redirection vers /dashboard. Un JWT décodable
//   ne garantit pas que l'utilisateur ou son organisation existent toujours en
//   base ; décider ici provoquerait une boucle 307 avec les pages protégées
//   (dashboard → /login → dashboard → …). La redirection « déjà connecté » est
//   donc déléguée à la page /login elle-même, qui valide la session contre la
//   base de données avant de rediriger (voir src/app/login/page.tsx).
// - Cookies invalides : un cookie de session présent mais illisible (corrompu,
//   expiré, signature invalide) est détruit sur la réponse afin que le navigateur
//   cesse de le renvoyer — le formulaire de connexion s'affiche simplement.
// - Rôle STUDENT : aucun accès au tableau de bord (aucun compte étudiant prévu).
// - Rôle TEACHER : accès restreint aux modules pédagogiques ; toutes les
//   données financières (paiements, voyages, dépenses, POS) sont masquées.
//
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
  const hasStaleCookie = SESSION_COOKIE_NAMES.some((name) =>
    request.cookies.has(name)
  );

  if (hasStaleCookie) {
    for (const name of SESSION_COOKIE_NAMES) {
      response.cookies.delete(name);
    }
  }

  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  let token = null;

  try {
    token = await getToken({
      req: request,
      // NextAuth v5 lit AUTH_SECRET (fallback NEXTAUTH_SECRET pour compatibilité).
      secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    });
  } catch {
    // Cookie corrompu / signature invalide : traité comme une absence de
    // session (le nettoyage ci-dessous détruira le cookie fautif).
    token = null;
  }

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

    // Routes publiques (/login, /register) : aucune redirection. Le cookie
    // invalide éventuel est détruit et le formulaire est servi normalement.
    return clearInvalidSessionCookies(NextResponse.next(), request);
  }

  // --------------------------------------
  // Session JWT valide : contrôle d'accès par rôle sur /dashboard
  // --------------------------------------
  // NB : volontairement AUCUNE redirection automatique /login → /dashboard ici.
  // La page /login décide elle-même, après validation en base de données.
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
  matcher: ["/dashboard/:path*", "/login", "/register"],
};