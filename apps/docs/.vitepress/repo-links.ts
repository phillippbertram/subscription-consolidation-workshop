import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { MarkdownEnv, MarkdownRenderer } from 'vitepress';

import { docsDir, repoBranch, repoRoot, repoUrl, routeFor } from './routes';

// A scheme (`https:`, `mailto:`) or a leading slash marks a link that is not
// relative to the Markdown file and therefore needs no rewriting.
const absoluteLinkPattern = /^(?:[a-z][a-z\d+.-]*:|\/)/i;

/**
 * Rewrites relative links so the same Markdown works on GitHub and on the site.
 *
 * The docs link to each other and to source files with relative paths, which
 * GitHub resolves from the file's own folder. VitePress would resolve them from
 * the generated page instead (see `rewrites` in routes.ts), and source files are
 * not part of the site at all. This rule therefore resolves every relative link
 * against the source file and replaces it with:
 *
 * - the site route, when the target is a published page in docs/;
 * - a GitHub URL on the main branch for everything else (code, READMEs, TASKS.md).
 *
 * It runs as a core rule while parsing, before VitePress renders the links.
 * VitePress then adds the base path, checks routes for dead pages, and opens
 * GitHub URLs in a new tab. A link to a file that does not exist fails the
 * build, because it is broken on GitHub as well.
 */
export function repoLinks(
  md: MarkdownRenderer,
  publishedPages: ReadonlySet<string>,
): void {
  md.core.ruler.after('inline', 'repo-links', (state) => {
    const env = state.env as MarkdownEnv;
    const sourceFile = env.realPath ?? env.path;

    for (const blockToken of state.tokens) {
      for (const token of blockToken.children ?? []) {
        const href = token.type === 'link_open' ? token.attrGet('href') : null;

        if (href && isRelativeLink(href)) {
          token.attrSet(
            'href',
            resolveRelativeLink(href, sourceFile, publishedPages),
          );
        }
      }
    }
  });
}

function isRelativeLink(href: string): boolean {
  return !href.startsWith('#') && !absoluteLinkPattern.test(href);
}

function resolveRelativeLink(
  href: string,
  sourceFile: string,
  publishedPages: ReadonlySet<string>,
): string {
  const hashIndex = href.indexOf('#');
  const linkPath = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const hash = hashIndex === -1 ? '' : href.slice(hashIndex);

  const target = path.resolve(path.dirname(sourceFile), decodeURI(linkPath));
  const repoPath = toPosixPath(path.relative(repoRoot, target));

  if (repoPath.startsWith('../') || !existsSync(target)) {
    const sourcePath = toPosixPath(path.relative(repoRoot, sourceFile));

    throw new Error(
      `Broken link "${href}" in ${sourcePath}: ${repoPath} does not exist.`,
    );
  }

  const docsPath = toPosixPath(path.relative(docsDir, target));

  if (publishedPages.has(docsPath)) {
    return routeFor(docsPath) + hash;
  }

  // GitHub shows folders under /tree/ and files under /blob/.
  const view = statSync(target).isDirectory() ? 'tree' : 'blob';

  return `${repoUrl}/${view}/${repoBranch}/${encodeURI(repoPath)}${hash}`;
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}
