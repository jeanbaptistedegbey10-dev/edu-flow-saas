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
  secret:
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "fallback-secret-for-production-build",

  // Stratégie JWT obligatoire avec CredentialsProvider (pas de sessions base de données).
  session: {
    strategy: "jwt",
  },

  // Nécessaire lorsque l'application est déployée derrière un proxy / sur Vercel.
  trustHost: true,

  // Politique de cookies : on laisse NextAuth choisir son mode par défaut afin
  // d'éviter tout blocage de cookies `__Secure-` sur les domaines Vercel
  // (.vercel.app). Le forçage explicite de `useSecureCookies` en production
  // provoquait des échecs de session sur ces domaines. Voir src/proxy.ts
  // (SESSION_COOKIE_NAMES) qui gère le nettoyage des cookies invalides.
  // useSecureCookies: process.env.NODE_ENV === "production",

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
    // NOTE (stabilisation) : les callbacks ci-dessous ne retournent JAMAIS
    // null et ne plantent jamais sur une propriété absente. Chaque lecture
    // est protégée par un garde-fou (`if (user)`, `if (session.user && token)`)
    // et chaque écriture emploie un défaut sûr (`?? null`) pour éviter les
    // états `undefined` dans le JWT/session.

    /**
     * Au moment de la connexion (`user` présent), copie les informations
     * multi-tenant dans le token JWT. Sur les appels suivants, le token
     * enrichi est simplement réutilisé.
     */
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        // `organizationId` peut être absent selon le provider : on force un
        // défaut sûr (`null`, jamais `undefined`) pour le JWT.
        token.organizationId = (user as any).organizationId ?? null;
      }

      return token;
    },

    /**
     * Expose `id`, `role` et `organizationId` sur `session.user`
     * pour l'ensemble de l'application (Server Components, Server Actions…).
     */
    session({ session, token }) {
      // Garde-fou : on ne modifie `session.user` que si elle existe ET si
      // un token est présent — évite toute erreur sur propriété absente.
      if (session.user && token) {
        session.user.id = token.id as string;
        (session.user as any).role = token.role;
        (session.user as any).organizationId = token.organizationId ?? null;
      }

      return session;
    },
  },
});