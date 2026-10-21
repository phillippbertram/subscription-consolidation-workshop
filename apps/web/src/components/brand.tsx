import { Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-base font-semibold tracking-tight',
        className,
      )}
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-primary to-emerald-600 text-primary-foreground shadow-sm">
        <Ticket className="size-4" aria-hidden />
      </span>
      PremiumPass
    </span>
  );
}

/** Reminds every screen that payments and data are not real. */
export function TestModeBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning',
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-warning" aria-hidden />
      Test mode
    </span>
  );
}
