import { ShieldCheck } from 'lucide-react';

export function AdminLogo() {
  return (
    <span className="inline-flex items-center gap-2 text-base font-semibold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-primary to-emerald-600 text-primary-foreground shadow-sm">
        <ShieldCheck className="size-4" aria-hidden />
      </span>
      PremiumPass
      <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-semibold text-background">
        Admin
      </span>
    </span>
  );
}

/** Reminds every screen which data it shows and that it is local only. */
export function LocalTargetBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
      <span className="size-1.5 rounded-full bg-success" aria-hidden />
      Local Compose
    </span>
  );
}
