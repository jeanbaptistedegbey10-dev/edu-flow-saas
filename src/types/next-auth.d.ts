import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// --------------------------------------
// Enrichissement des types NextAuth v5
// --------------------------------------
//
// La session et le token JWT embarquent désormais les informations
// nécessaires à l'isolation multi-tenant :
// - `id`             : identifiant de l'utilisateur (User.id)
// - `role`           : rôle applicatif (enum Prisma `Role`)
// - `organizationId` : organisation de rattachement de l'utilisateur

declare module "next-auth" {
  // `organizationId` est nullable au niveau du JWT/session car il peut être
  // absent à la connexion. La base de données (via src/lib/session.ts) reste
  // la source de vérité et ré-affiche toujours une organisation valide.
  interface User {
    id: string;
    role: Role;
    organizationId: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      organizationId: string | null;
    } & DefaultSession["user"];
  }
}

// `next-auth/jwt` est un simple ré-export de `@auth/core/jwt` :
// c'est donc ce module qu'il faut enrichir pour que le typage
// s'applique aux callbacks internes de la bibliothèque.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    organizationId: string | null;
  }
}
