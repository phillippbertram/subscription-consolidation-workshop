import type { Theme } from 'vitepress';
// The variant without fonts skips VitePress's bundled Inter; brand.css loads Geist instead.
import DefaultTheme from 'vitepress/theme-without-fonts';

import './brand.css';
import { MermaidDiagram } from './mermaid-diagram';

// The default VitePress theme with PremiumPass colors, plus the one component
// the Markdown needs.
const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('MermaidDiagram', MermaidDiagram);
  },
};

export default theme;
