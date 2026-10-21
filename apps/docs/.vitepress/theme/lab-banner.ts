import { withBase } from 'vitepress';
import { defineComponent, h } from 'vue';

/**
 * A thin bar above the navigation on every page. Readers often arrive through
 * a deep link (a setup step, a search result), so the page itself has to say
 * that this is a demo lab and not a product or a library. The whole bar links
 * to "What this is" on the start page.
 */
export const LabBanner = defineComponent({
  name: 'LabBanner',
  setup() {
    return () =>
      h('a', { class: 'lab-banner', href: withBase('/#what-this-is') }, [
        h('strong', 'Demo lab'),
        h('span', ' for cross-platform subscription management'),
        h(
          'span',
          { class: 'lab-banner-detail' },
          ' · try it out, break it, understand it · test modes and synthetic data only',
        ),
        h('span', { 'aria-hidden': 'true' }, ' →'),
      ]);
  },
});
