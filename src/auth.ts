import { randomBytes } from "crypto";

import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { seedDemoDataForOrganization } from "@/lib/demo-seed";
import { computeTrialEndDate } from "@/lib/license-check";
import { prisma } from "@/lib/prisma";
import { generateUniqueOrganizationSlug } from "@/lib/slug";
import {
  isPlatformSuperAdminEmail,
  PLATFORM_SUPER_ADMIN_EMAIL,
} from "@/lib/platform-admin";

// --------------------------------------
// Configuration NextAuth v5 (Auth.js)
// --------------------------------------
//
// Authentification par identifiants (email + mot de passe hashé avec bcrypt).
// Stratégie de session : JWT (requis pour le provider Credentials),
// ce qui permet au middleware/proxy de vérifier l'authentification
// sans accès à la base de données.

// ---------------------------------------------------------------------------
// Variables d'environnement Auth/OAuth — résolues UNE SEULE fois au chargement
// du module avec des logues explicites. Elles sont chargées par Next.js parmi
// `.env*` (dev) ET les variables de déploiement (Vercel). Rappel : les fichiers
// `.env` sont ignorés par git, il faut donc REPORTER ces valeurs dans les
// « Environment Variables » du projet Vercel.
// ---------------------------------------------------------------------------

// Secret partagé pour la signature des JWT de session.
// Garantit que getToken() dans src/proxy.ts et auth() utilisent exactement
// le même secret — un mismatch fait échouer la vérification JWT côté proxy
// tandis que auth() réussit, créant une boucle /login ↔ /dashboard sur Vercel.
//
// IMPORTANT : aucun fallback « en clair » n'est utilisé (un secret codé en dur
// dans le code source serait publique et permettrait de forger des sessions).
// En production, un secret manquant fait échouer Auth.js immédiatement
// (MissingSecret → error=Configuration) — c'est volontaire : on préfère
// échouer vite et visiblement plutôt que de fonctionner avec un secret compromis.
const authSecret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

if (!authSecret) {
  const message =
    "[auth] AUTH_SECRET / NEXTAUTH_SECRET non défini. " +
    (process.env.NODE_ENV === "production"
      ? "ERREUR FATALE EN PRODUCTION : les connexions (Google incluses) échoueront avec error=Configuration. Définissez AUTH_SECRET (ou NEXTAUTH_SECRET) dans les variables d'environnement Vercel et redéployez."
      : "En développement, Auth.js peut fonctionner sans secret local stable, mais il est recommandé de le définir dans .env.");

  if (process.env.NODE_ENV === "production") {
    throw new Error(message);
  }
  console.warn(message);
}

// Identifiants Google OAuth : on accepte volontairement LES DEUX conventions
// de nommage (AUTH_GOOGLE_* de Auth.js et GOOGLE_CLIENT_* de Google/NextAuth v4)
// pour tolérer toute configuration passée ou future, en local comme sur Vercel.
// Un des deux jeux de variables suffit :
//   AUTH_GOOGLE_ID   / AUTH_GOOGLE_SECRET   (recommandé, Auth.js v5)
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (convention NextAuth v4 / Google)
const googleClientId =
  process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID;
const googleClientSecret =
  process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET;

if (!googleClientId || !googleClientSecret) {
  const message =
    "[auth] Google OAuth incomplet — clientId/clientSecret manquants. " +
    "La connexion Google échouera avec error=Configuration (l'échange du code OAuth " +
    "échoue côté Google). Définissez sur Vercel : AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET " +
    "(ou GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET).";

  if (process.env.NODE_ENV === "production") {
    throw new Error(message);
  }
  console.warn(message);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Secret partagé pour la signature des JWT de session (voir ci-dessus).
  secret: authSecret,

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
        // Jeton anti-robot (Cloudflare Turnstile) — champ optionnel côté
        // formulaire ; il n'est vérifié que si TURNSTILE_SECRET_KEY est défini.
        turnstileToken: { label: "Vérification anti-robot", type: "text" },
      },

      /**
       * Vérifie les identifiants soumis :
       * 0. (optionnel, si configured) Vérification du jeton Turnstile.
       * 1. Recherche de l'utilisateur par email (normalisé en minuscules).
       * 2. Vérification que le compte est actif.
       * 3. Comparaison du mot de passe avec le hash bcrypt stocké.
       *
       * Retourne `null` en cas d'échec → NextAuth renvoie une erreur
       * `CredentialsSignin` côté client (message générique, sans fuite d'information).
       *
       * NOTE : le contrôle Turnstile est effectué côté client dans le
       * formulaire (soumission bloquée tant que le widget n'est pas validé).
       * Le contrôle serveur ici est la défense en profondeur : il fait fi du
       * client et valide le jeton via l'API officielle siteverify.
       */
      async authorize(credentials) {
        // 0. Vérification anti-robot (Cloudflare Turnstile) — uniquement si
        //    la clé secrète serveur est configurée.
        const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();

        if (turnstileSecret) {
          const turnstileToken =
            typeof credentials?.turnstileToken === "string"
              ? credentials.turnstileToken.trim()
              : "";

          const captchaOk = await verifyTurnstileToken(
            turnstileToken,
            turnstileSecret
          );

          if (!captchaOk) {
            console.warn(
              "[auth] Connexion refusée : vérification anti-robot (Turnstile) invalide ou absente."
            );
            return null;
          }
        }

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
      clientId: googleClientId ?? "",
      clientSecret: googleClientSecret ?? "",
      // Permet de lier automatiquement un compte existant ayant le même email
      // Google (sinon Auth.js refuse la connexion avec OAuthAccountNotLinked).
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

        // 0. Super Admin principal de la plateforme (email unique). Cette
        //    adresse est la seule à pouvoir rejoindre le back-office (route
        //    obfusquée — voir src/lib/super-admin-route.ts). La logique ci-après
        //    ne dépend pas d'un seed préalable : l'organisation porteuse et le
        //    compte sont créés à la volée si absents (compatibilité avec le
        //    bouton « Continue avec Google »).
        if (isPlatformSuperAdminEmail(email)) {
          const existingSuper = await prisma.user.findUnique({
            where: { email },
            select: { id: true, role: true, isActive: true, avatarUrl: true },
          });

          // Compte existant : on rétablit le rôle SUPER_ADMIN + l'activation.
          if (existingSuper) {
            const updates: {
              role?: "SUPER_ADMIN";
              isActive?: boolean;
              avatarUrl?: string;
            } = {};

            if (existingSuper.role !== "SUPER_ADMIN") {
              updates.role = "SUPER_ADMIN";
            }

            if (!existingSuper.isActive) {
              updates.isActive = true;
            }

            if (!existingSuper.avatarUrl && user.image) {
              updates.avatarUrl = user.image;
            }

            if (Object.keys(updates).length > 0) {
              await prisma.user.update({
                where: { id: existingSuper.id },
                data: updates,
              });
            }

            return true;
          }

          // Première connexion Google du Super Admin : provisioning minimal —
          // organisation porteuse (slug eduflow-platform) + compte SUPER_ADMIN.
          // Aucun jeu de données de démonstration n'est injecté : ce compte
          // administre la plateforme, il ne consomme pas de licence client.
          const adminPasswordHash = await bcrypt.hash(
            randomBytes(24).toString("base64url"),
            10
          );

          await prisma.$transaction(async (tx) => {
            let platformOrg = await tx.organization.findUnique({
              where: { slug: "eduflow-platform" },
              select: { id: true },
            });

            if (!platformOrg) {
              platformOrg = await tx.organization.create({
                data: {
                  name: "EduFlow Platform",
                  slug: "eduflow-platform",
                  email,
                },
              });
            }

            await tx.user.create({
              data: {
                organizationId: platformOrg.id,
                email,
                passwordHash: adminPasswordHash,
                firstName:
                  profile?.given_name ||
                  (user.name?.trim().split(" ")[0] as string) ||
                  "Super",
                lastName:
                  profile?.family_name ||
                  (user.name?.trim().split(" ").slice(1).join(" ") as string) ||
                  "Admin",
                role: "SUPER_ADMIN",
                isActive: true,
                avatarUrl: user.image ?? null,
              },
            });
          });

          return true;
        }

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
          // DIAGNOSTIC : log détaillé pour identifier la cause racine dans les
          // logs de déploiement (Vercel → Functions). Les erreurs typiques sont
          // - DATABASE_URL manquant → PrismaClientInitializationError
          // - Pooler Supabase (pgBouncer) → P2024 timeout / transaction cancelled
          // - Client Prisma non généré → PrismaClientConstructorNotFound
          //
          // On ne retourne PAS `false` : dans Auth.js v5, un `signIn` qui retourne
          // `false` → AccessDenied, et une erreur non-AuthError levée ici
          // (ex: TypeError/timeout Prisma) → error=Configuration. Ni l'un ni
          // l'autre n'aide l'utilisateur. On redirige plutôt vers /login avec un
          // code d'erreur explicite que le LoginForm affiche en langage clair.
          const isDbError =
            error instanceof Error &&
            /prisma|database|connection|timeout|pooler|pgbouncer/i.test(
              error.message
            );
          const errorCode = isDbError ? "OnboardingDbError" : "OnboardingFailed";

          console.error(
            `[auth/signIn] Échec de l'onboarding Google (code=${errorCode}, email=${user.email}) :`,
            error
          );
          return `/login?error=${errorCode}`;
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

// --------------------------------------
// Vérification serveur du jeton Cloudflare Turnstile (anti-robot)
// --------------------------------------
// La défense en profondeur : le widget côté client bloque la soumission tant
// que le challenge n'est pas résolu ; le serveur valide indépendamment le jeton
// reçu via la clé secrète, en évitant toute contournement du client.
//
// `fetch` côté serveur (Node runtime) — jamais exposé au client (la clé
// secrète ne quitte jamais le serveur).
async function verifyTurnstileToken(
  token: string,
  secret: string
): Promise<boolean> {
  if (!token) {
    return false;
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        // `cache: "no-store"` : chaque tentative de connexion est isolée.
        cache: "no-store",
        body: new URLSearchParams({
          secret,
          response: token,
        }).toString(),
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { success?: unknown };
    return data.success === true;
  } catch {
    // En cas d'erreur réseau, on échoue OUVERT : si le secret n'est pas
    // configuré le widget n'est pas non plus rendu (branche ci-dessus). Ici le
    // secret existe mais siteverify est injoignable — on refuse par
    // prudence (l'utilisateur peut réessayer).
    return false;
  }
}