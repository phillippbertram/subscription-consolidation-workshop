import { LoaderCircle, Wrench } from 'lucide-react';
import { Logo } from './brand';

/** Shown instead of the app when `.env` is missing or invalid; nothing calls Auth0. */
export function SetupPage({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg space-y-6 rounded-2xl border bg-card p-8 shadow-sm">
        <Logo />
        <div className="space-y-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <Wrench className="size-5" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            Finish setting up the website
          </h1>
          <p className="text-muted-foreground">{message}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          The setup guides in <code>docs/setup/</code> list every value and
          where to find it.
        </p>
      </div>
    </div>
  );
}

export function SessionLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <Logo />
      <p
        className="flex items-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Restoring your session…
      </p>
    </div>
  );
}
