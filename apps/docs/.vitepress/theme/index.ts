import type { Theme } from 'vitepress';
// The variant without fonts skips VitePress's bundled Inter; brand.css loads Geist instead.
import DefaultTheme from 'vitepress/theme-without-fonts';
import { h } from 'vue';

import './brand.css';
import { LabBanner } from './lab-banner';
import { MermaidDiagram } from './mermaid-diagram';

// The default VitePress theme with PremiumPass colors, a "demo lab" bar on
// every page, and the one component the Markdown needs.
const theme: Theme = {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, { 'layout-top': () => h(LabBanner) }),
  enhanceApp({ app }) {
    app.component('MermaidDiagram', MermaidDiagram);
  },
};

export default theme;
