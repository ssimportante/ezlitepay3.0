
// src/app/layout.tsx
import type { ReactNode } from 'react';
import './globals.css';
import ClientLayout from './client-layout'; // Import the new client layout
import type { Metadata } from 'next';

// The root layout is a Server Component, so this is the correct place for app-wide metadata.
// The favicon is now handled by the new `icon.tsx` file as per Next.js convention.
export const metadata: Metadata = {
  title: 'EZLitePay',
  description: 'A modern payroll and HR management system.',
  openGraph: {
    title: 'EZLitePay',
    description: 'A modern payroll and HR management system.',
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#1e3a8a" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
