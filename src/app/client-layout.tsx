'use client';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/contexts/auth-context';
import { Toaster } from '@/components/ui/toaster';
export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthProvider>
        {children}
        <Toaster />
      </AuthProvider>
    </>
  );
}
