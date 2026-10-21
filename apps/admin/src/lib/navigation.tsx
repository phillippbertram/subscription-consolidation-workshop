import { useSyncExternalStore, type ComponentProps } from 'react';

/**
 * Five pages, one with a user ID. A small History API wrapper is enough, the
 * same approach as the website; a larger app would use a router library.
 * API calls go to /admin/* on this origin, so no page path starts with /admin.
 */
export type Route =
  | { page: 'overview' }
  | { page: 'users' }
  | { page: 'user'; userId: string }
  | { page: 'outbox' }
  | { page: 'processing' };

const navigationEvent = 'premiumpass-admin:navigate';

export function parseRoute(pathname: string): Route {
  const user = /^\/users\/([0-9a-f-]{36})$/.exec(pathname)?.[1];
  if (user) {
    return { page: 'user', userId: user };
  }

  switch (pathname) {
    case '/users':
      return { page: 'users' };
    case '/outbox':
      return { page: 'outbox' };
    case '/processing':
      return { page: 'processing' };
    default:
      return { page: 'overview' };
  }
}

export function userPath(userId: string) {
  return `/users/${userId}`;
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(navigationEvent, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(navigationEvent, onChange);
  };
}

/** Subscribe to the pathname; parse outside the snapshot to keep it stable. */
export function usePathname() {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function navigate(path: string) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new Event(navigationEvent));
  }

  window.scrollTo({ top: 0 });
}

export function AppLink({
  to,
  onClick,
  ...props
}: Omit<ComponentProps<'a'>, 'href'> & { to: string }) {
  return (
    <a
      href={to}
      onClick={(event) => {
        onClick?.(event);
        // Keep browser defaults for new tabs and windows.
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        event.preventDefault();
        navigate(to);
      }}
      {...props}
    />
  );
}
