import { $createCodeHighlightNode } from "@lexical/code-core";
import {
  $createLineBreakNode,
  $isLineBreakNode,
  $isTextNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  ElementNode,
  type LexicalNode,
  type NodeKey,
  type SerializedElementNode,
  type SerializedTextNode,
  type Spread,
  TextNode,
} from "lexical";
import { CSS_CLASSES } from "./constants";

export type SerializedMarkdownCodeBlockNode = Spread<
  { language: string },
  SerializedElementNode
>;

export class MarkdownCodeBlockNode extends ElementNode {
  __language: string;

  static getType(): string {
    return CSS_CLASSES.CODE_BLOCK;
  }

  static clone(node: MarkdownCodeBlockNode): MarkdownCodeBlockNode {
    return new MarkdownCodeBlockNode(node.__language, node.__key);
  }

  constructor(language: string, key?: NodeKey) {
    super(key);
    this.__language = language;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const dom = document.createElement("pre");
    dom.className = CSS_CLASSES.CODE_BLOCK;
    dom.setAttribute("data-language", this.__language);
    return dom;
  }

  updateDOM(prevNode: MarkdownCodeBlockNode, dom: HTMLElement): boolean {
    if (prevNode.__language !== this.__language) {
      dom.setAttribute("data-language", this.__language);
    }
    return false;
  }

  // Emit a semantic `<pre><code>` for HTML export (`$generateHtmlFromNodes`).
  // The editing children are the literal ``` fences, per-line highlight nodes
  // and structural line breaks, so skip them via `$getChildNodes` and rebuild
  // just the code body from `getCodeText()`.
  exportDOM(): DOMExportOutput {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    if (this.__language) {
      code.className = `language-${this.__language}`;
    }
    code.textContent = this.getCodeText() ?? this.getTextContent();
    pre.appendChild(code);
    return { element: pre, $getChildNodes: () => [] };
  }

  static importDOM(): DOMConversionMap | null {
    return {
      pre: () => ({
        conversion: $convertPreElement,
        priority: 1,
      }),
    };
  }

  static importJSON(
    serializedNode: SerializedMarkdownCodeBlockNode,
  ): MarkdownCodeBlockNode {
    return new MarkdownCodeBlockNode(serializedNode.language);
  }

  exportJSON(): SerializedMarkdownCodeBlockNode {
    return {
      ...super.exportJSON(),
      type: CSS_CLASSES.CODE_BLOCK,
      language: this.__language,
      version: 1,
    };
  }

  setLanguage(language: string): void {
    const writable = this.getWritable();
    writable.__language = language;
  }

  getLanguage(): string {
    return this.getLatest().__language;
  }

  getOpenFence(): MarkdownCodeFenceNode | null {
    const first = this.getFirstChild();
    return $isMarkdownCodeFenceNode(first) ? first : null;
  }

  getCloseFence(): MarkdownCodeFenceNode | null {
    const last = this.getLastChild();
    return $isMarkdownCodeFenceNode(last) ? last : null;
  }

  // Returns the middle content (between the fences) joined with "\n". The
  // first linebreak after the open fence is the structural separator and is
  // excluded. Returns null when the surrounding fences are missing.
  //
  // Convention: always flush the trailing buffered line at loop end. Under
  // the canonical layout the trailing LB pushes the last line before the
  // loop exits, so the flush is a no-op; under the transient "close fence
  // merged" layout the flush emits the last line. The returned string
  // reflects the textual content regardless of layout — callers that need
  // to distinguish canonical vs. transient should consult
  // `hasTrailingLineBreak()` instead of inspecting children.
  getCodeText(): string | null {
    const children = this.getChildren();
    if (children.length < 2) return null;
    const first = children[0];
    const last = children[children.length - 1];
    if (!$isMarkdownCodeFenceNode(first) || !$isMarkdownCodeFenceNode(last)) {
      return null;
    }
    const lines: string[] = [];
    let currentLine = "";
    let firstLineBreakSeen = false;
    for (let i = 1; i < children.length - 1; i++) {
      const child = children[i];
      if ($isLineBreakNode(child)) {
        if (!firstLineBreakSeen) {
          firstLineBreakSeen = true;
          continue;
        }
        lines.push(currentLine);
        currentLine = "";
        continue;
      }
      if ($isTextNode(child)) {
        currentLine += child.getTextContent();
      }
    }
    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
    return lines.join("\n");
  }

  // Whether the children currently end with the canonical
  // `[..., trailingLB, closeFence]` separation between content and the close
  // fence. The four cases:
  //
  //   1. close fence missing (degenerate)                         → true
  //   2. `[..., content, LB, closeFence]`            (canonical)  → true
  //   3. `[openFence, LB, closeFence]`     (merged-on-empty)      → false
  //   4. `[..., content, closeFence]` (merged onto last content)  → false
  //
  // Cases 3 and 4 are the transient "close fence merged onto the last content
  // line" state produced by close-fence-line-start Backspace (see DESIGN.md
  // "Backspace at block boundaries" / `$mergeCloseFenceIntoLastContentLine`).
  // Case 1 defaults to true so rebuilders do not invent a merged layout for a
  // degenerate structure; callers that depend on the close fence's existence
  // guard separately.
  hasTrailingLineBreak(): boolean {
    const closeFence = this.getCloseFence();
    if (!closeFence) return true; // case 1: degenerate
    const prevOfLast = closeFence.getPreviousSibling();
    if (!$isLineBreakNode(prevOfLast)) return false; // case 4: merged onto content
    const prevOfLastIsOpenFence = prevOfLast
      .getPreviousSibling()
      ?.is(this.getOpenFence());
    return !prevOfLastIsOpenFence; // case 3 (merged-on-empty) vs case 2 (canonical)
  }
}

export function $createMarkdownCodeBlockNode(
  language: string,
): MarkdownCodeBlockNode {
  return new MarkdownCodeBlockNode(language);
}

export function $createEmptyMarkdownCodeBlockNode(
  language: string,
): MarkdownCodeBlockNode {
  const block = $createMarkdownCodeBlockNode(language);
  $appendCodeBlockChildren(block, `\`\`\`${language}`, [""], "```");
  return block;
}

export function $isMarkdownCodeBlockNode(
  node: LexicalNode | null | undefined,
): node is MarkdownCodeBlockNode {
  return node instanceof MarkdownCodeBlockNode;
}

// Length of the "```" prefix that every fence row carries.
export const OPEN_FENCE_PREFIX_LENGTH = 3;

// Canonical child layout is [openFence, separatorLB, firstContent, ...]; the
// first content line sits at child index 2.
export const FIRST_CONTENT_LINE_CHILD_INDEX = 2;

// "TextNode but not a fence" — i.e. a regular content text node inside the
// middle of a code block (highlight tokens, raw inserts, etc.).
export function $isContentTextNode(
  node: LexicalNode | null | undefined,
): node is TextNode {
  return $isTextNode(node) && !$isMarkdownCodeFenceNode(node);
}

// Anchor an element-type selection at the start of the first content line.
export function $selectFirstContentLineStart(
  codeBlock: MarkdownCodeBlockNode,
): void {
  codeBlock.select(
    FIRST_CONTENT_LINE_CHILD_INDEX,
    FIRST_CONTENT_LINE_CHILD_INDEX,
  );
}

const LANGUAGE_CLASS_REGEX = /^language-(.+)$/;

function detectLanguage(pre: HTMLElement): string {
  const dataLang = pre.getAttribute("data-language");
  if (dataLang) return dataLang;

  const code = pre.querySelector("code");
  if (code) {
    for (const cls of code.classList) {
      const m = LANGUAGE_CLASS_REGEX.exec(cls);
      if (m) return m[1];
    }
  }

  for (const cls of pre.classList) {
    const m = LANGUAGE_CLASS_REGEX.exec(cls);
    if (m) return m[1];
  }

  return "";
}

function $convertPreElement(domNode: HTMLElement): DOMConversionOutput {
  const language = detectLanguage(domNode);
  const raw = domNode.textContent ?? "";
  const text = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
  const lines = text.split("\n");

  const codeBlock = $createMarkdownCodeBlockNode(language);
  $appendCodeBlockChildren(codeBlock, `\`\`\`${language}`, lines, "```");

  return {
    node: codeBlock,
    forChild: () => null,
  };
}

// Builds the canonical code block child layout:
//   [ openFence, lb, (highlight)?, lb, (highlight)?, ..., lb, closeFence ]
// `codeLines` is the list of middle lines (no fence rows). For an "empty" block
// pass `[""]` so the resulting structure has a single editable middle line.
export function $appendCodeBlockChildren(
  codeBlock: MarkdownCodeBlockNode,
  openFenceText: string,
  codeLines: string[],
  closeFenceText: string,
): void {
  codeBlock.append($createMarkdownCodeFenceNode(openFenceText));
  for (const line of codeLines) {
    codeBlock.append($createLineBreakNode());
    if (line.length > 0) {
      codeBlock.append($createCodeHighlightNode(line));
    }
  }
  codeBlock.append($createLineBreakNode());
  codeBlock.append($createMarkdownCodeFenceNode(closeFenceText));
}

export class MarkdownCodeFenceNode extends TextNode {
  static getType(): string {
    return CSS_CLASSES.FENCE;
  }

  static clone(node: MarkdownCodeFenceNode): MarkdownCodeFenceNode {
    return new MarkdownCodeFenceNode(node.__text, node.__key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.classList.add(CSS_CLASSES.FENCE);
    return dom;
  }

  static importJSON(serializedNode: SerializedTextNode): MarkdownCodeFenceNode {
    const node = new MarkdownCodeFenceNode(serializedNode.text);
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setMode(serializedNode.mode);
    node.setStyle(serializedNode.style);
    return node;
  }

  exportJSON(): SerializedTextNode {
    return {
      ...super.exportJSON(),
      type: CSS_CLASSES.FENCE,
      version: 1,
    };
  }
}

export function $createMarkdownCodeFenceNode(
  text: string,
): MarkdownCodeFenceNode {
  return new MarkdownCodeFenceNode(text);
}

export function $isMarkdownCodeFenceNode(
  node: LexicalNode | null | undefined,
): node is MarkdownCodeFenceNode {
  return node instanceof MarkdownCodeFenceNode;
}
