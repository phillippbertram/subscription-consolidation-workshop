import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The site renders the repository's own docs/ folder. Source code, package
// READMEs, and agent notes stay on GitHub; links to them open there.
export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const docsDir = path.join(repoRoot, 'docs');
export const repoUrl =
  'https://github.com/phillippbertram/subscription-consolidation-workshop';
export const repoBranch = 'main';

// Planning notes and project decisions for maintainers and agents, not part of
// the reader's path. Links to them open on GitHub.
export const excludedPages = ['TASKS.md', 'DECISIONS.md'];

/** Lists the Markdown files under docs/ that become site pages, relative to docs/. */
export function listPublishedPages(): string[] {
  return readdirSync(docsDir, { recursive: true, encoding: 'utf8' })
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => file.endsWith('.md') && !excludedPages.includes(file))
    .sort();
}

/**
 * Maps a source file to the page VitePress generates for it:
 * `DYNAMODB_DATA_MODEL.md` becomes `dynamodb-data-model.md`, `setup/README.md`
 * becomes `setup/index.md`. The files keep their names in the repository,
 * so every link on GitHub keeps working.
 */
export function pagePathFor(sourcePath: string): string {
  const directory = path.posix.dirname(sourcePath);
  const fileName = path.posix.basename(sourcePath);
  const pageName =
    fileName === 'README.md'
      ? 'index.md'
      : fileName.toLowerCase().replaceAll('_', '-');

  return directory === '.' ? pageName : `${directory}/${pageName}`;
}

/** The site route of a published source file, without the base path: `/getting-started`, `/exercises/`. */
export function routeFor(sourcePath: string): string {
  const pagePath = pagePathFor(sourcePath);

  if (pagePath === 'index.md') {
    return '/';
  }

  if (pagePath.endsWith('/index.md')) {
    return `/${pagePath.slice(0, -'index.md'.length)}`;
  }

  return `/${pagePath.slice(0, -'.md'.length)}`;
}

/**
 * VitePress `rewrites` for every page whose generated path differs from its
 * source path. Built from the same rule as `routeFor`, so page URLs and the
 * links that point to them cannot drift apart.
 */
export function rewritesFor(
  sourcePaths: readonly string[],
): Record<string, string> {
  const rewrites: Record<string, string> = {};

  for (const sourcePath of sourcePaths) {
    const pagePath = pagePathFor(sourcePath);

    if (pagePath !== sourcePath) {
      rewrites[sourcePath] = pagePath;
    }
  }

  return rewrites;
}
