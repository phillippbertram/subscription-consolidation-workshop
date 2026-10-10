import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface Props {
  setupMessage?: string;
  signedIn?: boolean;
  loading?: boolean;
  userId?: string | undefined;
  pending?: boolean;
  expired?: boolean;
  message?: string;
  onLogin?: () => void;
  onLogout?: () => void;
  onCheckout?: () => void;
  onNewAttempt?: () => void;
}

export function DemoLayout(props: Props) {
  const result = new URLSearchParams(window.location.search).get('checkout');
  const returnMessage =
    result === 'success'
      ? 'Returned from Stripe. This URL is not payment verification and does not activate Premium.'
      : result === 'cancel'
        ? 'Checkout was left open. Resume the same attempt below.'
        : '';
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 border-b px-6 py-6">
        <a href="/" className="text-xl font-semibold tracking-tight">
          PremiumPass{' '}
          <span className="ml-2 text-xs font-normal uppercase tracking-widest text-muted-foreground">
            Web demo
          </span>
        </a>
        <Badge variant="secondary">Stripe test mode</Badge>
      </header>
      <main className="mx-auto max-w-5xl space-y-8 px-6 py-12 sm:py-20">
        <section className="max-w-2xl space-y-5">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            Your subscription, connected
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            A small upgrade.
            <br />A complete learning journey.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            Connect your demo account to Stripe Checkout. Follow the journey
            from Auth0 login to a monthly test subscription.
          </p>
        </section>
        {(props.setupMessage || props.message || returnMessage) && (
          <Alert className="bg-secondary/50">
            <AlertTitle>
              {props.setupMessage ? 'Set up your web demo' : 'Checkout status'}
            </AlertTitle>
            <AlertDescription className="space-y-2">
              {returnMessage && <p>{returnMessage}</p>}
              {(props.setupMessage || props.message) && (
                <p>{props.setupMessage || props.message}</p>
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                01 · Your account
              </p>
              <CardTitle>One identity across apps</CardTitle>
              <CardDescription>
                Use the same Auth0 demo account and connection as your mobile
                app.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <Badge variant="outline">
                {props.loading
                  ? 'Restoring session'
                  : props.signedIn
                    ? 'Signed in'
                    : 'Not signed in'}
              </Badge>
              {props.userId ? (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Internal user ID
                  </p>
                  <p className="mt-1 break-all font-mono text-sm">
                    {props.userId}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  The backend links your verified identity to a stable customer
                  record.
                </p>
              )}
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                disabled={Boolean(props.setupMessage) || props.loading}
                onClick={props.signedIn ? props.onLogout : props.onLogin}
              >
                {props.signedIn ? 'Sign out' : 'Sign in with Auth0'}
              </Button>
            </CardFooter>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
                02 · Your plan
              </p>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Premium Monthly</CardTitle>
                <Badge>Monthly</Badge>
              </div>
              <CardDescription>
                One recurring test subscription. The configured price appears
                securely in Stripe Checkout.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-3 text-sm">
                <li>✓ Hosted Stripe checkout</li>
                <li>✓ Linked to your PremiumPass account</li>
                <li>✓ Safe retries with the same checkout attempt</li>
              </ul>
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-3">
              <Button
                disabled={!props.signedIn || !props.userId || props.pending}
                onClick={props.onCheckout}
              >
                {props.pending
                  ? 'Preparing checkout…'
                  : 'Continue to test checkout →'}
              </Button>
              {props.expired && (
                <Button variant="outline" onClick={props.onNewAttempt}>
                  Start a new attempt
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Learning checkpoint · This step creates the customer and checkout
          session. Webhooks and subscription processing follow in P06 step 2;
          returning here does not unlock Premium. Use synthetic details and
          Stripe test cards only.
        </p>
      </main>
      <footer className="mx-auto max-w-5xl border-t px-6 py-6 text-xs text-muted-foreground">
        PremiumPass · React / Auth0 / Stripe · Local learning environment
      </footer>
    </div>
  );
}
