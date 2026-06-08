import { $generateHtmlFromNodes } from "@lexical/html";
import type { BaseSelection, LexicalEditor } from "lexical";

/**
 * Serializes a live editor's current content to semantic HTML.
 *
 * A thin wrapper around the standard `$generateHtmlFromNodes` that handles the
 * required `editor.read()`, so callers don't have to import `@lexical/html` or
 * remember the read wrapper. Pass a `selection` to export only the selected
 * nodes.
 *
 * Custom nodes' `exportDOM` decides the output: `MarkdownCodeBlockNode` emits
 * `<pre><code class="language-…">` rather than the editing DOM (the literal
 * ``` fences and per-line highlight nodes).
 */
export function getEditorHtml(
  editor: LexicalEditor,
  selection?: BaseSelection | null,
): string {
  return editor.read(() => $generateHtmlFromNodes(editor, selection));
}
