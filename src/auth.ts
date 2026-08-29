import { randomBytes } from "crypto";

import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { seedDemoDataForOrganization } from "@/lib/demo-seed";
import { computeTrialEndDate } from "@/lib/license-check";
import { prisma } from "@/lib/prisma";
import { generateUniqueOrganizationSlug } from "@/lib/slug";

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
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  callbacks: {
    // NOTE (stabilisation) : les callbacks ci-dessous ne retournent JAMAIS
    // null et ne plantent jamais sur une propriété absente. Chaque lecture
    // est protégée par un garde-fou (`if (user)`, `if (session.user && token)`)
    // et chaque écriture emploie un défaut sûr (`?? null`) pour éviter les
    // états `undefined` dans le JWT/session.

    /**
     * Gère la connexion via OAuth (Google) — UNIQUE voie de création de compte
     * Organisme / Administrateur :
     * - Si un utilisateur avec ce même email existe déjà, on le connecte (et
     *   on complète son avatar si besoin).
     * - Sinon, la première connexion Google d'un administrateur crée
     *   AUTOMATIQUEMENT :
     *     1. son organisation (slug unique) en plan TRIAL/ACTIVE avec une
     *        période d'essai gratuite de 30 jours (`trialEndsAt = J+30`) ;
     *     2. son compte administrateur (un mot de passe aléatoire est haché
     *        pour satisfaire la contrainte `User.passwordHash @nonNullable` ;
     *        l'authentification de ce compte passe exclusivement par Google).
     *   Le jeu de données de démonstration est ensuite injecté pour permettre
     *   une prise en main immédiate (voir Task 4 — actions de ré-injection /
     *   réinitialisation dédiées dans src/lib/actions/demo-data.ts).
     *
     * `allowDangerousEmailAccountLinking: true` permet de lier automatiquement
     * un compte existant avec le même email.
     */
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && user.email) {
        const email = user.email.trim().toLowerCase();

        try {
          // 1. Compte existant → simple connexion (+ avatar si manquant).
          const existingUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true, organizationId: true, avatarUrl: true },
          });

          if (existingUser) {
            if (!existingUser.avatarUrl && user.image) {
              await prisma.user.update({
                where: { id: existingUser.id },
                data: { avatarUrl: user.image },
              });
            }
            return true; // Autorise la connexion
          }

          // 2. Première connexion : création organisation (essai 30 j) + admin.
          const organizationName =
            user.name?.trim() || profile?.name?.trim() || "Centre de formation";
          const slug = await generateUniqueOrganizationSlug(organizationName);
          const trialEndsAt = computeTrialEndDate();
          const passwordHash = await bcrypt.hash(
            randomBytes(24).toString("base64url"),
            10
          );

          let createdAdmin: { id: string; organizationId: string } | null =
            null;

          // La valeur est RETOURNÉE par le callback de transaction : TypeScript
          // infère son type depuis le retour (évite le narrowing à `never`).
          createdAdmin = await prisma.$transaction(async (tx) => {
            const organization = await tx.organization.create({
              data: {
                name: organizationName,
                slug,
                // Onboarding : essai gratuit de 30 jours.
                planType: "TRIAL",
                planStatus: "ACTIVE",
                trialEndsAt,
              },
            });

            const admin = await tx.user.create({
              data: {
                organizationId: organization.id,
                email,
                passwordHash,
                firstName:
                  profile?.given_name ||
                  (user.name?.trim().split(" ")[0] as string) ||
                  "Admin",
                lastName:
                  profile?.family_name ||
                  (user.name?.trim().split(" ").slice(1).join(" ") as string) ||
                  "Administrateur",
                role: "ADMIN",
                avatarUrl: user.image ?? null,
              },
            });

            return {
              id: admin.id,
              organizationId: admin.organizationId,
            };
          });

          // 3. Injection du jeu de données de démonstration (non bloquante).
          if (createdAdmin) {
            try {
              await seedDemoDataForOrganization(
                createdAdmin.organizationId,
                createdAdmin.id
              );
            } catch (seedError) {
              console.error(
                "[auth/signIn] Échec du seeding de démonstration :",
                seedError
              );
            }
          }

          return true;
        } catch (error) {
          console.error(
            "[auth/signIn] Échec de l'onboarding Google :",
            error
          );
          return false;
        }
      }
      return true;
    },

    /**
     * Au moment de la connexion (`user` présent), copie les informations
     * multi-tenant dans le token JWT. Sur les appels suivants, le token
     * enrichi est simplement réutilisé.
     *
     * IMPORTANT (OAuth) : pour le provider Google, `user.id` fourni par
     * Auth.js est le `sub` (identifiant Google), PAS l'identifiant de notre
     * table `User`. On résout donc l'utilisateur de la base par email afin de
     * propager le VRAI `id`, `role` et `organizationId` dans le JWT. Sans
     * cela, la session pointait vers un id inexistant et toutes les requêtes
     * multi-tenant échouaient silencieusement.
     */
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google") {
          const email =
            typeof user.email === "string"
              ? user.email.trim().toLowerCase()
              : null;

          if (email) {
            try {
              const dbUser = await prisma.user.findUnique({
                where: { email },
                select: { id: true, role: true, organizationId: true },
              });

              if (dbUser) {
                token.id = dbUser.id;
                token.role = dbUser.role;
                token.organizationId = dbUser.organizationId;
              }
            } catch (error) {
              console.error(
                "[auth/jwt] Échec de la résolution de l'utilisateur DB (OAuth) :",
                error
              );
            }
          }
        } else {
          token.id = user.id as string;
          token.role = user.role;
          // `organizationId` peut être absent selon le provider : on force un
          // défaut sûr (`null`, jamais `undefined`) pour le JWT.
          token.organizationId = (user as any).organizationId ?? null;
        }
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