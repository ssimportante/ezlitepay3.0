
// src/app/kiosk/kiosk-initializer.tsx
'use client';

import type { ReactNode } from "react";
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

const KIOSK_AUTHORIZED_USER_EMAIL = 'kiosk@beanespress.com';

/**
 * This component is ONLY for the KIOSK layout. It ensures:
 * 1. Unauthenticated users are sent to /login.
 * 2. Authenticated regular users are sent to /dashboard.
 * 3. Only the authorized KIOSK user can view the kiosk content.
 */
export function KioskInitializer({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  useEffect(() => {
    if (loading) {
      return; // Wait until authentication state is resolved.
    }

    // 1. If no user, redirect to login.
    if (!user) {
      if (pathname !== '/login') {
        router.replace('/login');
      }
      return;
    }
    
    // 2. Check if the logged-in user is the designated kiosk user.
    const isKioskUser = user.email === KIOSK_AUTHORIZED_USER_EMAIL;

    // 3. If it's a regular user trying to access /kiosk, redirect them away.
    if (!isKioskUser) {
        toast({
            variant: "destructive",
            title: "Access Denied",
            description: "You are not authorized to view the kiosk page."
        });
        router.replace('/dashboard');
    }

  }, [user, loading, router, pathname, toast]);

  // Show a loader while checking auth state.
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }
  
  const isKioskUser = user && user.email === KIOSK_AUTHORIZED_USER_EMAIL;

  // Render children only if the user is the authorized kiosk user.
  if (user && isKioskUser) {
    return <>{children}</>;
  }

  // Fallback loader for all other cases (e.g., redirecting).
  return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
  );
}
