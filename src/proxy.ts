import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// --------------------------------------
// Protection des routes (ex-middleware, renommé « proxy » en Next.js 16)
// --------------------------------------
//
// - /dashboard/* : redirige vers /login si l'utilisateur n'est pas authentifié.
// - /login       : redirige vers /dashboard si l'utilisateur est déjà connecté.
//
// La vérification s'appuie sur le token JWT de session (stratégie JWT),
// sans accès base de données : le fichier reste léger et rapide.

const LOGIN_PATH = "/login";
const DASHBOARD_PATH = "/dashboard";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const token = await getToken({
    req: request,
    // NextAuth v5 lit AUTH_SECRET (fallback NEXTAUTH_SECRET pour compatibilité).
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  });

  const isAuthenticated = Boolean(token);

  // Utilisateur non authentifié tentant d'accéder au tableau de bord :
  // redirection vers la page de connexion en mémorisant la destination
  // initiale (callbackUrl) pour y revenir après connexion.
  if (!isAuthenticated && pathname.startsWith(DASHBOARD_PATH)) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);

    return NextResponse.redirect(loginUrl);
  }

  // Utilisateur déjà connecté accédant à la page de connexion :
  // redirection directe vers le tableau de bord.
  if (isAuthenticated && pathname.startsWith(LOGIN_PATH)) {
    return NextResponse.redirect(new URL(DASHBOARD_PATH, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};