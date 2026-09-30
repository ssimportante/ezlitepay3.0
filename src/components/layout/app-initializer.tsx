
// src/components/layout/app-initializer.tsx
'use client';

import type { ReactNode } from "react";
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

const KIOSK_AUTHORIZED_USER_EMAIL = 'kiosk@beanespress.com';

/**
 * This component is for the MAIN application layout. It ensures:
 * 1. Unauthenticated users are sent to /login.
 * 2. The special KIOSK user is immediately redirected to /kiosk if they land here.
 * 3. Authenticated regular users can view the app content.
 */
export function AppInitializer({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) {
      return; // Wait until authentication state is resolved.
    }

    if (!user) {
      // If not logged in, redirect to login page, but not if they are already on it.
      if (pathname !== '/login') {
        router.replace('/login');
      }
      return;
    }
    
    // Check if the logged-in user is the designated kiosk user by email.
    const isKioskUser = user.email === KIOSK_AUTHORIZED_USER_EMAIL;

    if (isKioskUser) {
      // If the kiosk user lands anywhere in the main app, redirect them to their dedicated page.
      router.replace('/kiosk');
    }

  }, [user, loading, router, pathname]);

  // Show a loader while checking auth state.
  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }
  
  const isKioskUser = user && user.email === KIOSK_AUTHORIZED_USER_EMAIL;

  // Render children only if a user is logged in AND it's not the kiosk user.
  // The kiosk user will see a loader here during the brief moment before redirection.
  if (user && !isKioskUser) {
    return <>{children}</>;
  }

  // Fallback loader for all other cases (e.g., redirecting).
  return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
  );
}
