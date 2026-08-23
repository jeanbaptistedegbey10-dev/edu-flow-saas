"use client"

import { ChevronsUpDown, LogOut } from "lucide-react"
import { signOut } from "next-auth/react"
import type { Role } from "@prisma/client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

// --------------------------------------
// Pied de page utilisateur de la Sidebar
// --------------------------------------
//
// Affiche l'utilisateur connecté (nom, email, badge de rôle) et ouvre
// un menu déroulant permettant la déconnexion via NextAuth.
//
// Les données de session sont transmises par le Server Component
// `src/app/dashboard/layout.tsx` (via `auth()`), ce qui évite d'ajouter
// un `SessionProvider` côté client uniquement pour cet affichage.

export interface SessionUser {
  name?: string | null
  email?: string | null
  role?: Role | null
}

/** Styles du badge selon le rôle applicatif (enum Prisma `Role`). */
const roleBadgeStyles: Record<Role, string> = {
  SUPER_ADMIN: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  ADMIN: "bg-red-500/15 text-red-600 dark:text-red-400",
  STAFF: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  TEACHER: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  STUDENT: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
}

/** Libellés lisibles des rôles. */
const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: "SUPER ADMIN",
  ADMIN: "ADMIN",
  STAFF: "STAFF",
  TEACHER: "TEACHER",
  STUDENT: "STUDENT",
}

/** Extrait les initiales (2 max) pour l'avatar sans photo. */
function getInitials(name?: string | null): string {
  if (!name?.trim()) return "?"
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("") || "?"
  )
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
        roleBadgeStyles[role]
      )}
    >
      {roleLabels[role]}
    </span>
  )
}

export function NavUser({ user }: { user?: SessionUser | null }) {
  const name = user?.name ?? "Utilisateur"
  const email = user?.email ?? ""
  // Rôle de repli si la session est incomplète (ne devrait pas arriver :
  // le proxy protège déjà les routes /dashboard/*).
  const role: Role = user?.role ?? "STAFF"

  const handleSignOut = () => {
    void signOut({ redirectTo: "/login" })
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
            >
              {/* Avatar avec initiales */}
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {getInitials(name)}
              </div>

              {/* Nom + email */}
              <div className="grid flex-1 grid-rows-2 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {email}
                </span>
              </div>

              {/* Badge de rôle (masqué en mode réduit) */}
              <div className="group-data-[collapsible=icon]:hidden">
                <RoleBadge role={role} />
              </div>
              <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:ml-0" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side="top"
            align="start"
            className="min-w-56 rounded-lg"
          >
            {/* Identité complète dans le menu */}
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1.5 py-1.5 text-left text-sm">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {getInitials(name)}
                </div>
                <div className="grid min-w-0 flex-1 grid-rows-2 leading-tight">
                  <span className="truncate font-medium">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {email}
                  </span>
                </div>
                <RoleBadge role={role} />
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={handleSignOut}
              className="cursor-pointer"
            >
              <LogOut />
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}