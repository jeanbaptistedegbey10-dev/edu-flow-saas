import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { prisma } from "@/lib/prisma";

// --------------------------------------
// Configuration NextAuth v5 (Auth.js)
// --------------------------------------
//
// Authentification par identifiants (email + mot de passe hashé avec bcrypt).
// Stratégie de session : JWT (requis pour le provider Credentials),
// ce qui permet au middleware/proxy de vérifier l'authentification
// sans accès à la base de données.

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Secret partagé pour la signature des JWT de session.
  // Garantit que getToken() dans src/proxy.ts et auth() utilisent exactement
  // le même secret — un mismatch fait échouer la vérification JWT côté proxy
  // tandis que auth() réussit, créant une boucle /login ↔ /dashboard sur Vercel.
  // En production, ce secret doit être défini dans les variables d'environnement
  // Vercel (AUTH_SECRET ou NEXTAUTH_SECRET).
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,

  // Stratégie JWT obligatoire avec CredentialsProvider (pas de sessions base de données).
  session: {
    strategy: "jwt",
  },

  // Nécessaire lorsque l'application est déployée derrière un proxy / sur Vercel.
  trustHost: true,

  // Politique de cookies adaptée à l'environnement.
  // En production (HTTPS, Vercel derrière un proxy), le cookie de session est
  // émis préfixé `__Secure-` et marqué `Secure` → uniquement transmis en HTTPS.
  // En développement (http://localhost) on retombe sur `authjs.session-token`.
  // Ces deux noms exacts sont ceux attendus par le nettoyage de cookie invalide
  // dans src/proxy.ts (SESSION_COOKIE_NAMES). Le forçage explicite garantit
  // cohérence du cookie entre la page /login et le proxy.
  useSecureCookies: process.env.NODE_ENV === "production",

  pages: {
    signIn: "/login",
  },

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },

      /**
       * Vérifie les identifiants soumis :
       * 1. Recherche de l'utilisateur par email (normalisé en minuscules).
       * 2. Vérification que le compte est actif.
       * 3. Comparaison du mot de passe avec le hash bcrypt stocké.
       *
       * Retourne `null` en cas d'échec → NextAuth renvoie une erreur
       * `CredentialsSignin` côté client (message générique, sans fuite d'information).
        */
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : null;
        const password =
          typeof credentials?.password === "string" ? credentials.password : null;

        if (!email || !password) {
          console.error(
            "[auth] authorize: email or password missing in credentials",
          );
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        // Compte inexistant ou désactivé : même réponse générique.
        if (!user || !user.isActive) {
          console.error(
            `[auth] authorize: user not found or inactive for email "${email}" (isActive: ${user ? user.isActive : "user not found"})`,
          );
          return null;
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

        if (!isPasswordValid) {
          console.error(
            `[auth] authorize: password verification failed for email "${email}"`,
          );
          return null;
        }

        // Les champs `role` et `organizationId` sont propagés dans le token JWT
        // via le callback `jwt` ci-dessous (voir src/types/next-auth.d.ts).
        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          image: user.avatarUrl ?? undefined,
          role: user.role,
          organizationId: user.organizationId,
        };
      },
    }),
  ],

  callbacks: {
    /**
     * Au moment de la connexion (`user` présent), copie les informations
     * multi-tenant dans le token JWT. Sur les appels suivants, le token
     * enrichi est simplement réutilisé.
     */
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.organizationId = user.organizationId;
      }

      return token;
    },

    /**
     * Expose `id`, `role` et `organizationId` sur `session.user`
     * pour l'ensemble de l'application (Server Components, Server Actions…).
     */
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.organizationId = token.organizationId;

      return session;
    },
  },
});