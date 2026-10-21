import { type DefaultTheme, defineConfig } from 'vitepress';

import { githubSlug, mermaidFence } from './github-markdown';
import { repoLinks } from './repo-links';
import {
  excludedPages,
  listPublishedPages,
  repoBranch,
  repoUrl,
  rewritesFor,
  routeFor,
} from './routes';

const publishedPages = listPublishedPages();
const publishedPageSet = new Set(publishedPages);

/** A sidebar or nav entry for a page in docs/. Fails the build when the file is not published. */
function page(
  sourcePath: string,
  text: string,
  anchor?: string,
): DefaultTheme.SidebarItem & { link: string } {
  if (!publishedPageSet.has(sourcePath)) {
    throw new Error(
      `"${text}" points to docs/${sourcePath}, which is not a published page.`,
    );
  }

  return {
    text,
    link: anchor ? `${routeFor(sourcePath)}#${anchor}` : routeFor(sourcePath),
  };
}

/** An entry for a file that is not part of the site; it opens on GitHub. */
function onGitHub(repoPath: string, text: string): DefaultTheme.SidebarItem {
  return { text, link: `${repoUrl}/blob/${repoBranch}/${repoPath}` };
}

// One sidebar for every page, in the order a reader sets up and tests the
// project. VitePress derives the "Previous/Next" links from this order.
const sidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Get started',
    items: [page('index.md', 'Overview'), page('CONCEPTS.md', 'Concepts')],
  },
  {
    text: 'Set up locally',
    items: [
      page('setup/README.md', 'Setup overview'),
      page('setup/workspace.md', 'Workspace'),
      page('setup/auth0.md', 'Auth0'),
      page('setup/stripe.md', 'Stripe'),
    ],
  },
  {
    text: 'Try it out',
    items: [
      page('try-it/README.md', 'Test checklist'),
      page('try-it/sign-in-and-tokens.md', 'Sign-in and tokens'),
      page('try-it/first-purchase.md', 'A first purchase'),
      page('try-it/several-sources.md', 'Several sources at once'),
      page('try-it/duplicates-and-crashes.md', 'Duplicates and crashes'),
      page('try-it/missed-updates.md', 'Missed updates and expiry'),
      page('try-it/complimentary-premium.md', 'Complimentary Premium'),
    ],
  },
  {
    text: 'Add platforms (optional)',
    items: [
      page('setup/apple.md', 'Apple + iOS app'),
      page('setup/google.md', 'Google + Android app'),
      page('setup/aws.md', 'AWS'),
    ],
  },
  {
    text: 'How it works',
    items: [
      page('ARCHITECTURE.md', 'Architecture'),
      page('PAYMENTS.md', 'Payments and access policy'),
      page('STORE_PURCHASES.md', 'Store purchases'),
      page('RECONCILIATION.md', 'Reconciliation'),
      page('DYNAMODB_DATA_MODEL.md', 'Data model'),
    ],
  },
  {
    text: 'Reference',
    items: [
      page('DEVELOPMENT.md', 'Development'),
      page('DEVELOPMENT.md', 'Cleanup', 'cleanup'),
      page('CONCEPTS.md', 'Glossary', 'glossary'),
      onGitHub('docs/TASKS.md', 'Project status'),
    ],
  },
];

const nav: DefaultTheme.NavItem[] = [
  page('setup/README.md', 'Setup'),
  page('try-it/README.md', 'Try it out'),
  page('ARCHITECTURE.md', 'How it works'),
  page('DEVELOPMENT.md', 'Reference'),
];

export default defineConfig({
  // "Lab" in every page title and in the navigation: this is a demo project
  // to try out and understand, not a product.
  title: 'PremiumPass Lab',
  description:
    'A hands-on demo lab for cross-platform subscription management: Stripe, App Store, and Google Play in test mode, one backend, one answer.',
  lang: 'en-US',

  // GitHub Pages serves this repository's site under its name.
  base: '/subscription-consolidation-workshop/',

  // Render the repository's docs/ folder in place; nothing is copied.
  srcDir: '../../docs',
  srcExclude: excludedPages,
  rewrites: rewritesFor(publishedPages),
  cleanUrls: true,
  lastUpdated: true,

  markdown: {
    anchor: { slugify: githubSlug },
    headers: { slugify: githubSlug },
    config(md) {
      repoLinks(md, publishedPageSet);
      mermaidFence(md);
    },
  },

  vite: {
    // Mermaid's chunks are about 700 kB, but they load only on pages that
    // contain a diagram (see theme/mermaid-diagram.ts).
    build: { chunkSizeWarningLimit: 800 },
    plugins: [
      {
        // The pages live in docs/, outside this package, so resolving `vue`
        // from a page finds nothing. VitePress already points the browser
        // bundle at its own Vue copy; for the server-side render, keep `vue`
        // and `vue/server-renderer` external so Node loads them from this
        // package, the same copy the theme uses.
        name: 'premiumpass:external-vue-for-ssr',
        enforce: 'pre',
        resolveId(id, _importer, options) {
          const isVue = id === 'vue' || id.startsWith('vue/');

          return options.ssr && isVue ? { id, external: true } : null;
        },
      },
    ],
  },

  themeConfig: {
    nav,
    sidebar,
    outline: { level: [2, 3] },
    search: { provider: 'local' },
    externalLinkIcon: true,
    socialLinks: [{ icon: 'github', link: repoUrl }],
    editLink: {
      // VitePress fills `:path` with the source path inside docs/ (before
      // rewrites). A string pattern is required: a function would be copied
      // to the browser without the constants it uses.
      pattern: `${repoUrl}/edit/${repoBranch}/docs/:path`,
      text: 'Edit this page on GitHub',
    },
  },
});
