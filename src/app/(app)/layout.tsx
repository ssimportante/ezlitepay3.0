
// src/app/(app)/layout.tsx
'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppInitializer } from '@/components/layout/app-initializer';
import { AppHeader } from '@/components/layout/app-header';

// This is the correct place for the app's metadata, as it's the layout for the main application routes.
const DEFAULT_TITLE = 'EZLitePay';

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // Since this is a Client Component, we manage the title with an effect.
    const pageName = pathname.split('/').pop() || 'Dashboard';
    const formattedPageName = pageName.charAt(0).toUpperCase() + pageName.slice(1);
    document.title = `${formattedPageName} | ${DEFAULT_TITLE}`;
  }, [pathname]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppInitializer>
          <div className="flex flex-col h-screen">
            <AppHeader />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </AppInitializer>
      </SidebarInset>
    </SidebarProvider>
  );
}
