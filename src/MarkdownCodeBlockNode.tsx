import {
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

  canBeEmpty(): false {
    return false;
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
