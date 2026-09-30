'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Terminal } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
        <div className="text-center max-w-lg">
            <h2 className="text-2xl font-semibold mb-4">Something went wrong!</h2>
            <p className="text-muted-foreground mb-6">
                An unexpected error occurred. You can try to recover by clicking the button below.
            </p>
            <Button onClick={() => reset()}>
                Try again
            </Button>
            <Alert variant="destructive" className="mt-8 text-left">
              <Terminal className="h-4 w-4" />
              <AlertTitle>Error Details</AlertTitle>
              <AlertDescription className="text-xs break-words">
                {error.message || 'An unknown error occurred.'}
              </AlertDescription>
            </Alert>
        </div>
    </main>
  );
}
