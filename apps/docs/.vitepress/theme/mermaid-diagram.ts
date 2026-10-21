import { useData } from 'vitepress';
import { defineComponent, h, onMounted, ref, watch } from 'vue';

let nextDiagramId = 0;

/**
 * Draws one Mermaid diagram in the browser.
 *
 * Mermaid needs the DOM, so the static build renders an empty container and
 * the library loads only on pages that contain a diagram. The diagram is drawn
 * again when the reader switches between light and dark mode. If the source
 * does not parse, the reader sees it as plain text instead of an empty box.
 */
export const MermaidDiagram = defineComponent({
  name: 'MermaidDiagram',
  props: {
    // URI-encoded diagram source, written by `mermaidFence` in github-markdown.ts.
    code: { type: String, required: true },
  },
  setup(props) {
    const { isDark } = useData();
    const svg = ref('');
    const failed = ref(false);
    const diagramId = `mermaid-diagram-${nextDiagramId++}`;
    const source = decodeURIComponent(props.code);

    async function draw(): Promise<void> {
      try {
        const { default: mermaid } = await import('mermaid');

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: isDark.value ? 'dark' : 'default',
        });

        const result = await mermaid.render(diagramId, source);

        svg.value = result.svg;
        failed.value = false;
      } catch (error) {
        console.error(`Mermaid could not render ${diagramId}`, error);
        failed.value = true;
      }
    }

    onMounted(() => void draw());
    watch(isDark, () => void draw());

    return () =>
      failed.value
        ? h('pre', source)
        : h('div', { class: 'mermaid-diagram', innerHTML: svg.value });
  },
});
