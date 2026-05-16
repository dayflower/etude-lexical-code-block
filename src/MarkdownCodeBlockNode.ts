import { $createCodeHighlightNode } from "@lexical/code-core";
import {
  $createLineBreakNode,
  $isLineBreakNode,
  $isTextNode,
  type DOMConversionMap,
  type DOMConversionOutput,
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

  // Returns the middle content (between the fences) joined with "\n". The
  // first linebreak after the open fence is the structural separator and is
  // excluded. Returns null when the surrounding fences are missing.
  //
  // The canonical layout terminates the last content line with an LB before
  // the close fence, so the loop alone is enough. When the close fence has
  // been merged onto the last content line (no terminating LB), the last line
  // is still pending in `currentLine` at loop end — flush it so we don't drop
  // text under that transient state.
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
}

export function $createMarkdownCodeBlockNode(
  language: string,
): MarkdownCodeBlockNode {
  return new MarkdownCodeBlockNode(language);
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
