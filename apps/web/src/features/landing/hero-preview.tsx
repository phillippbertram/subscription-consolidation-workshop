import { Check, Sparkles, TrendingUp } from 'lucide-react';

/**
 * An illustration of the signed-in overview for the landing page. It is static
 * example content, not account data; the real page loads everything from the API.
 */
export function HeroPreview() {
  return (
    <div
      className="relative mx-auto w-full max-w-md"
      role="img"
      aria-label="Example of the PremiumPass overview with a score of 94 and an active Premium membership on web, iOS, and Android"
    >
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-linear-to-br from-primary/20 via-emerald-300/20 to-transparent blur-2xl" />
      <div className="rounded-2xl border bg-card p-5 shadow-xl shadow-primary/10">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Score history</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[0.7rem] font-medium text-primary-foreground">
            <Sparkles className="size-3" /> Premium
          </span>
        </div>
        <div className="mt-4 flex items-end gap-3">
          <span className="text-5xl font-semibold tracking-tight">94</span>
          <span className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-success">
            <TrendingUp className="size-3.5" /> +1 since last month
          </span>
        </div>
        <svg viewBox="0 0 320 110" className="mt-4 h-auto w-full">
          <defs>
            <linearGradient id="hero-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M10,88 C50,80 70,72 110,64 S180,50 210,38 S280,24 310,18 L310,110 L10,110 Z"
            fill="url(#hero-area)"
          />
          <path
            d="M10,88 C50,80 70,72 110,64 S180,50 210,38 S280,24 310,18"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle
            cx="310"
            cy="18"
            r="5"
            fill="var(--card)"
            stroke="var(--primary)"
            strokeWidth="3"
          />
        </svg>
        <div className="mt-4 flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5 text-xs">
          <span>
            <span className="block font-medium">Premium Monthly</span>
            <span className="text-muted-foreground">Paid on the website</span>
          </span>
          <span className="rounded-full bg-success/10 px-2 py-0.5 font-medium text-success">
            Active
          </span>
        </div>
      </div>
      <div className="absolute top-1/2 -left-3 rounded-xl border bg-card px-3 py-2.5 shadow-lg sm:-left-12">
        <p className="mb-1.5 text-[0.7rem] font-medium text-muted-foreground">
          Same answer everywhere
        </p>
        <div className="flex gap-1.5">
          {['Web', 'iOS', 'Android'].map((platform) => (
            <span
              key={platform}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[0.7rem] font-medium text-secondary-foreground"
            >
              <Check className="size-3" /> {platform}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
