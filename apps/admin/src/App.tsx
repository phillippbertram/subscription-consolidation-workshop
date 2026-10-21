import { useEffect, useMemo, useState } from 'react';
import { createAdminClient, type AdminClient } from './api/admin-client';
import { useAdminState } from './api/use-admin-state';
import { AppShell } from './components/app-shell';
import { SecretGate } from './components/secret-gate';
import { parseRoute, usePathname } from './lib/navigation';
import { OverviewPage } from './features/overview/overview-page';
import { UsersPage } from './features/users/users-page';
import { UserDetailPage } from './features/users/user-detail-page';
import { OutboxPage } from './features/outbox/outbox-page';
import { ProcessingPage } from './features/processing/processing-page';

const secretKey = 'premiumpass-admin-secret';

/**
 * sessionStorage keeps the secret per tab and forgets it when the tab closes.
 * Storage can be unavailable (private mode, blocked site data); the console
 * then simply asks again after a reload.
 */
function readSecret() {
  try {
    return window.sessionStorage.getItem(secretKey);
  } catch {
    return null;
  }
}

function writeSecret(secret: string | null) {
  try {
    if (secret) {
      window.sessionStorage.setItem(secretKey, secret);
    } else {
      window.sessionStorage.removeItem(secretKey);
    }
  } catch {
    // Keep working with the in-memory value.
  }
}

export function App() {
  const [secret, setSecret] = useState(readSecret);
  const [rejected, setRejected] = useState<string>();

  if (!secret) {
    return (
      <SecretGate
        message={rejected}
        onSubmit={(value) => {
          writeSecret(value);
          setRejected(undefined);
          setSecret(value);
        }}
      />
    );
  }

  return (
    <Console
      secret={secret}
      onLock={(message) => {
        writeSecret(null);
        setRejected(message);
        setSecret(null);
      }}
    />
  );
}

function Console({
  secret,
  onLock,
}: {
  secret: string;
  onLock: (message?: string) => void;
}) {
  const client = useMemo(() => createAdminClient(secret), [secret]);
  const data = useAdminState(client);
  const route = parseRoute(usePathname());

  // A wrong secret is not a page error: ask for it again.
  useEffect(() => {
    if (data.error?.code === 'admin_secret_invalid') {
      onLock(data.error.message);
    }
  }, [data.error, onLock]);

  return (
    <AppShell route={route} data={data} onLock={() => onLock()}>
      {data.state ? (
        <Page
          route={route}
          state={data.state}
          client={client}
          onChanged={data.reload}
        />
      ) : (
        !data.error && (
          <p className="text-sm text-muted-foreground">Reading the table…</p>
        )
      )}
    </AppShell>
  );
}

function Page({
  route,
  state,
  client,
  onChanged,
}: {
  route: ReturnType<typeof parseRoute>;
  state: NonNullable<ReturnType<typeof useAdminState>['state']>;
  client: AdminClient;
  onChanged: () => Promise<void>;
}) {
  switch (route.page) {
    case 'overview':
      return <OverviewPage state={state} />;
    case 'users':
      return <UsersPage state={state} />;
    case 'user':
      return (
        <UserDetailPage
          state={state}
          userId={route.userId}
          client={client}
          onChanged={onChanged}
        />
      );
    case 'outbox':
      return <OutboxPage state={state} />;
    case 'processing':
      return (
        <ProcessingPage state={state} client={client} onChanged={onChanged} />
      );
  }
}
