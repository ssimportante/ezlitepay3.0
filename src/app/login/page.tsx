// src/app/login/page.tsx
'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, LogIn } from 'lucide-react';
import Image from 'next/image';

export default function LoginPage() {
  const { login, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-6">
      <Card className="w-full max-w-md shadow-xl bg-[#1a263c] text-gray-200 border-gray-700">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-32 h-32 relative" data-ai-hint="company logo container">
              <Image
                src="https://i.ibb.co/yBShM15f/Ez-P-Logo-PNG-1.png"
                alt="EZLitePay Logo"
                fill
                sizes="128px"
                className="object-contain"
                priority
                data-ai-hint="company logo"
              />
          </div>
          <CardTitle className="text-3xl font-bold text-white">EZLitePay</CardTitle>
          <CardDescription className="text-gray-400">Sign in to your payroll account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-300">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="bg-white border-gray-300 text-gray-900 placeholder:text-gray-400 focus:ring-primary"
              />
            </div>
            <Button type="submit" className="w-full text-lg py-6 bg-primary hover:bg-primary/90" disabled={loading}>
              {loading ? (
                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
              ) : (
                <LogIn className="mr-2 h-5 w-5" />
              )}
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
