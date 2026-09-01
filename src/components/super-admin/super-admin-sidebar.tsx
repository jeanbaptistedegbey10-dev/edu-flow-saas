"use client";

import {
  Banknote,
  Building2,
  KeyRound,
  ReceiptText,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
} from "@/components/ui/sidebar";

import { NavUser, type SessionUser } from "@/components/dashboard/nav-user";
import { cn } from "@/lib/utils";

/**
 * Onglets de navigation du back-office Super-Admin (/super-admin/*) :
 * - 🏢 Organisations (gestion des écoles / clients) ;
 * - 💰 Tarifs & Offres (grille tarifaire dynamique — acquisition + renouvellement) ;
 * - 🔑 Générateur de Licences (clés Ed25519 pour clients offline/desktop) ;
 * - 💳 Factures & Paiements SaaS.
 */
type SuperAdminMenuItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Égalité stricte de l'URL (utilisé pour l'onglet racine /super-admin). */
  exact?: boolean;
};

const superAdminMenu: SuperAdminMenuItem[] = [
  {
    title: "Organisations",
    url: "/super-admin",
    icon: Building2,
    exact: true,
  },
  {
    title: "💰 Tarifs & Offres",
    url: "/super-admin/pricing",
    icon: Banknote,
  },
  {
    title: "Générateur de Licences",
    url: "/super-admin/licenses",
    icon: KeyRound,
  },
  {
    title: "Factures & Paiements SaaS",
    url: "/super-admin/billing",
    icon: ReceiptText,
  },
];

function isItemActive(item: SuperAdminMenuItem, pathname: string | null): boolean {
  if (!pathname) return false;
  if (item.exact) return pathname === item.url;
  return pathname === item.url || pathname.startsWith(`${item.url}/`);
}

/** Styles d'accentuation de l'onglet actif (mode clair et sombre). */
const activeItemClass =
  "border-violet-300 bg-violet-50 text-violet-700 shadow-sm hover:bg-violet-100 hover:text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-300 dark:hover:bg-violet-500/25 dark:hover:text-violet-200";

function SidebarLink({ item, active }: { item: SuperAdminMenuItem; active: boolean }) {
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
        <Link href={item.url}>
          <item.icon />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function SuperAdminSidebar({ user }: { user?: SessionUser | null }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm transition-all duration-200">
            <ShieldCheck className="size-5" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-bold tracking-tight">Back-office</span>
            <span className="text-xs text-muted-foreground">EduFlow — Super-Admin</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plateforme</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {superAdminMenu.map((item) => (
                <SidebarLink
                  key={item.title}
                  item={item}
                  active={isItemActive(item, pathname)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
