import type { MarkdownRenderer } from 'vitepress';

// Small adapters so GitHub-flavored Markdown renders the same way on the site
// as it does on GitHub. The Markdown files themselves stay unchanged.

/**
 * Builds heading anchors the way GitHub does, so `#5-connect-the-configuration`
 * points to the same heading on both. VitePress's default slugs differ for
 * headings that start with a number (`_5-connect-…`) or contain punctuation.
 *
 * GitHub lowercases the text, drops everything except letters, numbers,
 * underscores, hyphens, and spaces, and turns each space into a hyphen.
 */
export function githubSlug(headingText: string): string {
  return headingText
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replaceAll(' ', '-');
}

/**
 * Renders ```mermaid fences as `<MermaidDiagram>`, which draws the diagram in
 * the browser (theme/mermaid-diagram.ts). GitHub renders the same fences natively.
 */
export function mermaidFence(md: MarkdownRenderer): void {
  const renderFence = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];

    if (token?.info.trim() === 'mermaid') {
      // Encoding keeps quotes, braces, and angle brackets in the diagram source
      // out of the Vue template that VitePress compiles each page into.
      return `<MermaidDiagram code="${encodeURIComponent(token.content)}" />\n`;
    }

    return renderFence
      ? renderFence(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };
}
