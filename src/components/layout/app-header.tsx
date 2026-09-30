
"use client";

import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogOut, UserCog, PanelLeft } from "lucide-react";
import { useSidebar, SidebarTrigger as ActualSidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";


interface AppHeaderProps {
  // Title is removed as per design
}

export function AppHeader({}: AppHeaderProps) {
  const { isMobile, toggleSidebar } = useSidebar();
  const { user, logout } = useAuth();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);


  const userInitial = user?.displayName?.charAt(0) || user?.email?.charAt(0) || "U";
  const userFirstName = user?.displayName?.split(' ')[0] || user?.email || "User";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6 shadow-sm">
      <div className="flex items-center gap-2">
        {hasMounted ? (
            isMobile ? (
              <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Toggle sidebar" className="text-foreground hover:bg-muted">
                <PanelLeft className="h-5 w-5" />
              </Button>
            ) : (
              <ActualSidebarTrigger />
            )
        ) : (
          <div className="h-8 w-8" /> // Placeholder to prevent layout shift
        )}
         <h1 className="text-xl font-semibold text-foreground hidden md:block">
           Welcome, {userFirstName}!
        </h1>
      </div>

      <div className="ml-auto flex items-center gap-3 md:gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
              <Avatar className="h-10 w-10 border">
                 <AvatarImage src={user?.photoURL || undefined} alt={user?.displayName || user?.email || ""} data-ai-hint="user avatar"/>
                <AvatarFallback>{userInitial}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.displayName || "User"}</p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings"><UserCog className="mr-2 h-4 w-4" />Account Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
