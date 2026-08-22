"use client"

import {
  LayoutDashboard,
  UsersRound,
  BookOpen,
  Wallet,
  PlaneTakeoff,
  ClipboardList,
  Settings,
  GraduationCap,
  CalendarDays,
  FileText,
  ListTodo,
  Building2,
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
    title: "Paiements",
    url: "/dashboard/payments",
    icon: Wallet,
  },
  {
    title: "Procédures voyage",
    url: "/dashboard/travel",
    icon: PlaneTakeoff,
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

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-5" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">EduFlow</span>
            <span className="text-xs text-muted-foreground">Centre de Formation</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
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
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}