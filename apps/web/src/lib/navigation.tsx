import { useSyncExternalStore, type ComponentProps } from 'react';

/**
 * The website has three signed-in pages and no route parameters, so a small
 * History API wrapper is enough. A larger app would use a router library for
 * nested layouts, data loading, and code splitting; this keeps the demo free of
 * that extra concept while still giving every page a real, shareable URL.
 */
export const appRoutes = ['/', '/billing', '/account'] as const;
export type AppRoute = (typeof appRoutes)[number];

const navigationEvent = 'premiumpass:navigate';

export function toAppRoute(value: unknown): AppRoute {
  return appRoutes.find((route) => route === value) ?? '/';
}

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(navigationEvent, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(navigationEvent, onChange);
  };
}

export function useRoute(): AppRoute {
  return useSyncExternalStore(subscribe, () =>
    toAppRoute(window.location.pathname),
  );
}

export function navigate(route: AppRoute) {
  if (window.location.pathname !== route || window.location.search) {
    window.history.pushState({}, '', route);
    window.dispatchEvent(new Event(navigationEvent));
  }

  window.scrollTo({ top: 0 });
}

/** Replaces the current entry, e.g. after the Auth0 callback or a Stripe return. */
export function replaceRoute(route: AppRoute, search = '') {
  window.history.replaceState({}, document.title, `${route}${search}`);
  window.dispatchEvent(new Event(navigationEvent));
}

/**
 * Stripe returns to `/?checkout=success|cancel`, a URL owned by the API. Show
 * that return on the billing page, where the user manages the attempt. The
 * query stays in the URL until the next navigation, so a reload keeps the
 * message but moving to another page does not repeat it.
 */
export function redirectCheckoutReturn() {
  const search = new URLSearchParams(window.location.search);
  if (window.location.pathname === '/' && search.has('checkout')) {
    replaceRoute('/billing', window.location.search);
  }
}

export function AppLink({
  to,
  onClick,
  ...props
}: Omit<ComponentProps<'a'>, 'href'> & { to: AppRoute }) {
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
