// src/app/kiosk/layout.tsx
import type { ReactNode } from 'react';
import { KioskInitializer } from './kiosk-initializer';
import ClientLayout from '../client-layout';

export default function KioskLayout({ children }: { children: ReactNode }) {
  return (
    <ClientLayout>
      <KioskInitializer>
          <main className="flex-1">
              {children}
          </main>
      </KioskInitializer>
    </ClientLayout>
  );
}
