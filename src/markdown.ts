import { marked } from 'marked';

/**
 * Render a Markdown string to HTML.
 *
 * Swappable: replace this function or override `marked` options to customise
 * the rendering pipeline (GFM, syntax highlighting, etc.).
 */
export function renderMarkdown(body: string): string {
  return marked.parse(body, { async: false }) as string;
}
