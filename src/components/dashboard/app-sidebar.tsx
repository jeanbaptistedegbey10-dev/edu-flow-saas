"use client"

import {
  LayoutDashboard,
  UsersRound,
  BookOpen,
  Layers,
  Wallet,
  PlaneTakeoff,
  ClipboardList,
  Settings,
  GraduationCap,
  CalendarDays,
  FileText,
  Building2,
  ShoppingCart,
  UserCheck,
  ClipboardCheck,
  ShieldCheck,
  CreditCard,
  type LucideIcon,
} from "lucide-react"
import { usePathname } from "next/navigation"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

import { NavUser, type SessionUser } from "@/components/dashboard/nav-user"
import { cn } from "@/lib/utils"

// Menu data
type MenuItem = {
  title: string
  url: string
  icon: LucideIcon
  /**
   * Correspondance stricte de l'URL (sans préfixe) : utilisée pour les
   * entrées racine (ex : « Tableau de bord ») et pour éviter que
   * « Paramètres » ne s'active aussi sur /dashboard/settings/roles.
   */
  exact?: boolean
}

const mainMenu: MenuItem[] = [
  {
    title: "Tableau de bord",
    url: "/dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    title: "Étudiants",
    url: "/dashboard/students",
    icon: UsersRound,
  },
  {
    title: "Cours",
    url: "/dashboard/courses",
    icon: BookOpen,
  },
  {
    title: "Classes",
    url: "/dashboard/classes",
    icon: Layers,
  },
  {
    title: "Évaluations & Examens",
    url: "/dashboard/evaluations",
    icon: ClipboardCheck,
  },
  {
    title: "Paiements",
    url: "/dashboard/payments",
    icon: Wallet,
  },
  {
    title: "Procédures voyage",
    url: "/dashboard/travels",
    icon: PlaneTakeoff,
  },
  {
    title: "Caisse / POS",
    url: "/dashboard/pos",
    icon: ShoppingCart,
  },
]

const teacherMenu: MenuItem[] = [
  {
    title: "Mes cours",
    url: "/dashboard/courses",
    icon: BookOpen,
  },
  {
    title: "Présences & Cahier de texte",
    url: "/dashboard/attendance",
    icon: UserCheck,
  },
  {
    title: "Évaluations & Examens",
    url: "/dashboard/evaluations",
    icon: ClipboardCheck,
  },
]

const managementMenu: MenuItem[] = [
  {
    title: "Tâches",
    url: "/dashboard/tasks",
    icon: ClipboardList,
  },
  {
    title: "Dépenses",
    url: "/dashboard/expenses",
    icon: FileText,
  },
  {
    title: "Calendrier",
    url: "/dashboard/calendar",
    icon: CalendarDays,
  },
]

const organizationMenu: MenuItem[] = [
  {
    title: "Abonnement / Licence",
    url: "/dashboard/billing",
    icon: CreditCard,
  },
  {
    title: "Organisation",
    url: "/dashboard/organization",
    icon: Building2,
  },
  {
    title: "Paramètres",
    url: "/dashboard/settings",
    icon: Settings,
    exact: true,
  },
  {
    title: "Rôles & Permissions",
    url: "/dashboard/settings/roles",
    icon: ShieldCheck,
  },
]

/**
 * Détermine si l'entrée de menu correspond à la route active : égalité stricte
 * lorsque `exact` est défini, sinon correspondance par préfixe d'URL (ex :
 * /dashboard/students/xyz active « Étudiants »).
 */
function isItemActive(item: MenuItem, pathname: string | null): boolean {
  if (!pathname) return false
  if (item.exact) return pathname === item.url
  return pathname === item.url || pathname.startsWith(`${item.url}/`)
}

/**
 * Styles d'accentuation de l'onglet actif : fond coloré + bordure nette afin
 * de repérer instantanément la section en cours (mode clair et sombre).
 */
const activeItemClass =
  "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm hover:bg-indigo-100 hover:text-indigo-800 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25 dark:hover:text-indigo-200"

/** Lien de menu avec état actif surligné (fond coloré + bordure). */
function SidebarLink({ item, active }: { item: MenuItem; active: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        tooltip={item.title}
        isActive={active}
        className={cn(
          "border border-transparent transition-all duration-200",
          active && activeItemClass
        )}
      >
        <a href={item.url}>
          <item.icon />
          <span>{item.title}</span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

interface AppSidebarProps {
  /**
   * Utilisateur connecté (issu de la session NextAuth résolue côté serveur
   * dans `src/app/dashboard/layout.tsx`).
   */
  user?: SessionUser | null
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()
  const isTeacher = user?.role === "TEACHER"

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-400 text-white shadow-sm transition-all duration-200">
            <GraduationCap className="size-5" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-bold tracking-tight">EduFlow</span>
            <span className="text-xs text-muted-foreground">Centre de Formation</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {isTeacher ? (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Principal</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {teacherMenu.map((item) => (
                    <SidebarLink
                      key={item.title}
                      item={item}
                      active={isItemActive(item, pathname)}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Gestion</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {managementMenu.map((item) => (
                    <SidebarLink
                      key={item.title}
                      item={item}
                      active={isItemActive(item, pathname)}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Principal</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {mainMenu.map((item) => (
                    <SidebarLink
                      key={item.title}
                      item={item}
                      active={isItemActive(item, pathname)}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Gestion</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {managementMenu.map((item) => (
                    <SidebarLink
                      key={item.title}
                      item={item}
                      active={isItemActive(item, pathname)}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Organisation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {organizationMenu.map((item) => (
                    <SidebarLink
                      key={item.title}
                      item={item}
                      active={isItemActive(item, pathname)}
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        {/* Pied de page : profil de l'utilisateur connecté + déconnexion */}
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}