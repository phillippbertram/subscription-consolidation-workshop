import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AdminLogo } from './brand';

/**
 * Ask for the admin secret before the first request. It is kept in this tab's
 * sessionStorage only, so closing the tab forgets it.
 */
export function SecretGate({
  message,
  onSubmit,
}: {
  message?: string | undefined;
  onSubmit: (secret: string) => void;
}) {
  const [value, setValue] = useState('');
  // Same threshold as the API's startup hint.
  const short = value.trim().length > 0 && value.trim().length < 16;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <form
        className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) {
            onSubmit(value.trim());
          }
        }}
      >
        <AdminLogo />
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Unlock the admin console</h1>
          <p className="text-sm text-muted-foreground">
            Enter the <code className="font-mono">ADMIN_SECRET</code> from{' '}
            <code className="font-mono">config/.env</code>. The local API checks
            it on every request; this tab keeps it until you close it.
          </p>
        </div>
        {message && (
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <label htmlFor="secret" className="text-sm font-medium">
            Admin secret
          </label>
          <input
            id="secret"
            type="password"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-describedby="secret-hint"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 font-mono text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          {/* A hint only: a simple passphrase is allowed for a local demo. */}
          <p
            id="secret-hint"
            className={
              short ? 'text-xs text-warning' : 'text-xs text-muted-foreground'
            }
          >
            {short
              ? 'Short passphrase: fine while the API listens on loopback only. On the LAN (pnpm dev:api:lan) others could guess it.'
              : 'Any passphrase works locally. For a long random one: openssl rand -base64 32.'}
          </p>
        </div>
        <Button type="submit" size="lg" className="w-full">
          <KeyRound aria-hidden />
          Unlock
        </Button>
      </form>
    </main>
  );
}
