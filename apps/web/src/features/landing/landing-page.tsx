import {
  ArrowRight,
  Check,
  ChevronDown,
  CreditCard,
  ShieldCheck,
  Smartphone,
  TrendingUp,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { AppRoute } from '../../lib/navigation';
import { cn } from '../../lib/utils';
import { Logo, TestModeBadge } from '../../components/brand';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { HeroPreview } from './hero-preview';

type SignIn = (returnTo?: AppRoute) => void;

/**
 * The signed-out website. Every call to action starts the Auth0 login; there
 * is no separate sign-up because workshop users are created in the Auth0
 * tenant. Nothing here reads account data, so it renders before any API call.
 */
export function LandingPage({
  message,
  onSignIn,
}: {
  message: string;
  onSignIn: SignIn;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <LandingHeader onSignIn={onSignIn} />
      <main className="flex-1">
        {message && (
          <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
            <Alert variant="destructive">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          </div>
        )}
        <Hero onSignIn={onSignIn} />
        <BuiltWith />
        <Features />
        <HowItWorks />
        <Pricing onSignIn={onSignIn} />
        <Faq />
        <CallToAction onSignIn={onSignIn} />
      </main>
      <LandingFooter />
    </div>
  );
}

const sectionLinks = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

function LandingHeader({ onSignIn }: { onSignIn: SignIn }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4 sm:px-6">
        <a href="/" aria-label="PremiumPass home">
          <Logo />
        </a>
        <nav
          className="hidden items-center gap-6 md:flex"
          aria-label="Sections"
        >
          {sectionLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={() => onSignIn()}>
            Sign in
          </Button>
          <Button
            className="hidden sm:inline-flex"
            onClick={() => onSignIn('/billing')}
          >
            Get Premium
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero({ onSignIn }: { onSignIn: SignIn }) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(60%_60%_at_70%_0%,var(--secondary),transparent)]" />
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2">
        <div className="space-y-8">
          <TestModeBadge />
          <div className="space-y-5">
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Your score history, on every device.
            </h1>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground">
              Subscribe once on the web, in the App Store, or on Google Play.
              PremiumPass keeps your membership in sync, so every app gives the
              same answer.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              className="h-11 px-5 text-base"
              onClick={() => onSignIn()}
            >
              Sign in to get started <ArrowRight />
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 px-5 text-base"
            >
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {['No real payments', 'Synthetic data', 'Cancel anytime'].map(
              (item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="size-4 text-success" aria-hidden />
                  {item}
                </li>
              ),
            )}
          </ul>
        </div>
        <HeroPreview />
      </div>
    </section>
  );
}

function BuiltWith() {
  return (
    <section className="border-y bg-card/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-6 text-sm font-medium text-muted-foreground sm:px-6">
        <span className="text-xs tracking-widest uppercase">Built with</span>
        {['Auth0', 'Stripe', 'App Store', 'Google Play', 'React', 'AWS'].map(
          (name) => (
            <span key={name}>{name}</span>
          ),
        )}
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-3 text-center">
      <p className="text-sm font-semibold text-primary">{eyebrow}</p>
      <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      <p className="text-lg text-pretty text-muted-foreground">{description}</p>
    </div>
  );
}

const features = [
  {
    icon: TrendingUp,
    title: 'Score history',
    text: 'Follow your synthetic score month by month. Unlocked as soon as your subscription is verified.',
  },
  {
    icon: Smartphone,
    title: 'One account, every app',
    text: 'Sign in with the same account on the web, iPhone, and Android and see the same membership.',
  },
  {
    icon: CreditCard,
    title: 'Pay where you are',
    text: 'Stripe Checkout on the web, App Store and Google Play in the mobile app. One Premium, three stores.',
  },
  {
    icon: ShieldCheck,
    title: 'Access you can trust',
    text: 'Premium comes from verified payment state, never from a success page. Duplicate or late events change nothing.',
  },
];

function Features() {
  return (
    <section
      id="features"
      className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28"
    >
      <SectionHeading
        eyebrow="Features"
        title="Everything Premium, wherever you signed up"
        description="A small product with the problems of a real one: several stores, one account, and access that has to be right every time."
      />
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="space-y-3 rounded-2xl border bg-card p-6 transition-shadow hover:shadow-md"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-primary">
              <feature.icon className="size-5" aria-hidden />
            </span>
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="text-sm text-muted-foreground">{feature.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const steps = [
  {
    title: 'Sign in',
    text: 'Use your workshop account. Everyone starts on the Free plan.',
  },
  {
    title: 'Choose a billing period',
    text: 'Pick daily or monthly and pay in Stripe Checkout with a test card such as 4242 4242 4242 4242.',
  },
  {
    title: 'Premium, everywhere',
    text: 'The backend verifies the payment through a signed webhook. Then the website and the apps show Premium.',
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y bg-card/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          eyebrow="How it works"
          title="From sign-in to Premium in three steps"
          description="The whole journey takes a few minutes and runs entirely in test mode."
        />
        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="relative space-y-3 rounded-2xl border bg-background p-6"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Pricing({ onSignIn }: { onSignIn: SignIn }) {
  return (
    <section
      id="pricing"
      className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28"
    >
      <SectionHeading
        eyebrow="Pricing"
        title="Start free. Upgrade when you are ready."
        description="Premium is billed daily or monthly in Stripe test mode. You see the exact test price in Checkout before you subscribe."
      />
      <div className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">
        <PricingCard
          name="Free"
          price="€0"
          caption="Forever"
          description="Everything you need to explore the demo."
          features={[
            'Sign in on web, iOS, and Android',
            'Profile and account details',
            'Subscription overview',
          ]}
          action={
            <Button
              variant="outline"
              className="h-10 w-full"
              onClick={() => onSignIn()}
            >
              Sign in
            </Button>
          }
        />
        <PricingCard
          highlighted
          name="Premium"
          price="Test price"
          caption="Daily or monthly"
          description="The full experience, on every device."
          features={[
            'Everything in Free',
            'Your full score history',
            'One membership across all stores',
            'Cancel anytime, keep access until the period ends',
          ]}
          action={
            <Button
              className="h-10 w-full"
              onClick={() => onSignIn('/billing')}
            >
              Sign in to subscribe <ArrowRight />
            </Button>
          }
        />
      </div>
    </section>
  );
}

function PricingCard({
  name,
  price,
  caption,
  description,
  features,
  action,
  highlighted = false,
}: {
  name: string;
  price: string;
  caption: string;
  description: string;
  features: string[];
  action: ReactNode;
  highlighted?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col gap-6 rounded-2xl border bg-card p-8',
        highlighted &&
          'border-primary shadow-xl shadow-primary/10 ring-1 ring-primary',
      )}
    >
      {highlighted && (
        <span className="absolute -top-3 left-8 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
          Recommended
        </span>
      )}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{name}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <p className="flex items-baseline gap-2">
        <span className="text-4xl font-semibold tracking-tight">{price}</span>
        <span className="text-sm text-muted-foreground">{caption}</span>
      </p>
      <ul className="flex-1 space-y-3 text-sm">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <Check
              className="mt-0.5 size-4 shrink-0 text-success"
              aria-hidden
            />
            {feature}
          </li>
        ))}
      </ul>
      {action}
    </div>
  );
}

const questions = [
  {
    question: 'Is this a real subscription?',
    answer:
      'No. PremiumPass is a learning project. Payments run in Stripe test mode, no money is charged, and all score data is synthetic.',
  },
  {
    question: 'Which card can I use?',
    answer:
      'Any Stripe test card, for example 4242 4242 4242 4242 with a future expiry date and any CVC. Use synthetic names and addresses.',
  },
  {
    question: 'Why is Premium not active right after checkout?',
    answer:
      'Returning from Stripe is only a redirect. Premium appears once the backend has verified the payment through the signed webhook, usually within seconds. Refresh the billing page if it takes longer.',
  },
  {
    question: 'Can I subscribe in the mobile app instead?',
    answer:
      'Yes. The iOS and Android apps sell the same Premium through the App Store and Google Play. Wherever you pay, your account shows one combined membership.',
  },
  {
    question: 'How do I cancel?',
    answer:
      'Open Billing and cancel your website subscription. Auto-renewal stops and you keep Premium until the paid period ends. Store subscriptions are managed in the App Store or Google Play.',
  },
];

function Faq() {
  return (
    <section id="faq" className="border-t bg-card/60">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions, answered"
          description="The short version of what happens behind the scenes."
        />
        <div className="mt-12 divide-y rounded-2xl border bg-background">
          {questions.map((item) => (
            <details key={item.question} className="group px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium [&::-webkit-details-marker]:hidden">
                {item.question}
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="pb-5 text-sm text-muted-foreground">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function CallToAction({ onSignIn }: { onSignIn: SignIn }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12">
        <div className="absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,rgb(255_255_255/0.15),transparent)]" />
        <div className="relative mx-auto max-w-xl space-y-6">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            Ready for your first test purchase?
          </h2>
          <p className="text-primary-foreground/80">
            Sign in, pick a billing period, and watch Premium appear on every
            device.
          </p>
          <Button
            variant="secondary"
            size="lg"
            className="h-11 px-5 text-base"
            onClick={() => onSignIn('/billing')}
          >
            Get Premium <ArrowRight />
          </Button>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-2">
          <Logo />
          <p className="text-sm text-muted-foreground">
            A hands-on workshop on subscription consolidation.
          </p>
        </div>
        <nav
          className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground"
          aria-label="Footer"
        >
          {sectionLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          Learning project · Stripe test mode · Synthetic data only
        </p>
      </div>
    </footer>
  );
}
