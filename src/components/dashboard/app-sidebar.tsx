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
} from "lucide-react"

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

// Menu data
const mainMenu = [
  {
    title: "Tableau de bord",
    url: "/dashboard",
    icon: LayoutDashboard,
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

const teacherMenu = [
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

const managementMenu = [
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

const organizationMenu = [
  {
    title: "Organisation",
    url: "/dashboard/organization",
    icon: Building2,
  },
  {
    title: "Paramètres",
    url: "/dashboard/settings",
    icon: Settings,
  },
]

interface AppSidebarProps {
  /**
   * Utilisateur connecté (issu de la session NextAuth résolue côté serveur
   * dans `src/app/dashboard/layout.tsx`).
   */
  user?: SessionUser | null
}

export function AppSidebar({ user }: AppSidebarProps) {
  const isTeacher = user?.role === "TEACHER";

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
              <SidebarGroupLabel>Espace enseignant</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {teacherMenu.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        <a href={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Gestion</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {managementMenu.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        <a href={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
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
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        <a href={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Gestion</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {managementMenu.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        <a href={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Organisation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {organizationMenu.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild tooltip={item.title}>
                        <a href={item.url}>
                          <item.icon />
                          <span>{item.title}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
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