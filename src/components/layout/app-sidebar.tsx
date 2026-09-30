
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Clock,
  CalendarDays,
  Users,
  CreditCard,
  FileText as ReportsIcon,
  Settings as SettingsIcon,
  Send,
  Activity,
} from "lucide-react";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { EZLitePayLogoIcon } from "@/components/icons/logo-icon";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/time-logs", icon: Clock, label: "Time Logs" },
  { href: "/schedule", icon: CalendarDays, label: "Schedule" },
  { href: "/requests", icon: Send, label: "Requests" },
  { href: "/employees", icon: Users, label: "Employees" },
  { href: "/payroll", icon: CreditCard, label: "Payroll" },
  { href: "/reports", icon: ReportsIcon, label: "Reports" },
  { href: "/logs", icon: Activity, label: "Logs" },
];

const EXPANDED_LOGO_URL = "https://i.ibb.co/8LC2Pz1f/EZLite-Pay-PNG.png";
const COLLAPSED_LOGO_URL = "https://i.ibb.co/yBShM15f/Ez-P-Logo-PNG-1.png";

export function AppSidebar() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  // Increased logo sizes as requested
  const expandedLogoClasses = "h-[6.5rem] w-full"; // Approx 40% increase from h-20
  const collapsedLogoClasses = "h-12 w-12"; // Approx 40% increase from h-9

  return (
    <Sidebar variant="sidebar" collapsible="icon" className="group border-r border-sidebar-border">
      <SidebarHeader className="p-3 flex items-center justify-center">
        <Link href="/dashboard" className="flex items-center justify-center w-full" onClick={() => isMobile && setOpenMobile(false)}>
          <EZLitePayLogoIcon
            src={EXPANDED_LOGO_URL}
            alt="EZLitePay Logo Expanded"
            className={cn("transition-opacity duration-200 shrink-0", expandedLogoClasses, "group-data-[state=collapsed]:hidden")}
          />
          <EZLitePayLogoIcon
            src={COLLAPSED_LOGO_URL}
            alt="EZLitePay Logo Collapsed"
            className={cn("transition-opacity duration-200 shrink-0", collapsedLogoClasses, "hidden group-data-[state=collapsed]:block")}
          />
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex-grow">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))}
                tooltip={item.label}
                className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:rounded-lg"
              >
                <Link href={item.href} onClick={() => isMobile && setOpenMobile(false)}>
                  <item.icon className="text-sidebar-foreground group-data-[active=true]:text-sidebar-primary-foreground"/>
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-2 border-t border-sidebar-border">
         <SidebarMenu>
           <SidebarMenuItem>
             <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/settings")}
              tooltip="Settings"
              className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:rounded-lg"
            >
              <Link href="/settings" onClick={() => isMobile && setOpenMobile(false)}>
                <SettingsIcon className="text-sidebar-foreground group-data-[active=true]:text-sidebar-primary-foreground"/>
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
