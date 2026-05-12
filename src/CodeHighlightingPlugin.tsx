import {
  $createCodeHighlightNode,
  $isCodeHighlightNode,
} from "@lexical/code-core";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createLineBreakNode,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  type LexicalEditor,
  type LexicalNode,
  type TextNode,
} from "lexical";
import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-python";
import "prismjs/components/prism-markup";
import { useEffect } from "react";
import {
  $isMarkdownCodeFenceNode,
  MarkdownCodeBlockNode,
} from "./MarkdownCodeBlockNode";

type FlatToken = { type: string | null; content: string };

type ExpectedChild =
  | { kind: "linebreak" }
  | { kind: "highlight"; text: string; highlightType: string | null };

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  html: "markup",
  xml: "markup",
};

function resolveGrammar(language: string): Prism.Grammar | null {
  if (!language) return null;
  const key = LANGUAGE_ALIASES[language] ?? language;
  return Prism.languages[key] ?? null;
}

function tokenize(code: string, grammar: Prism.Grammar): FlatToken[] {
  const flat: FlatToken[] = [];
  const walk = (token: Prism.Token | string, parentType: string | null) => {
    if (typeof token === "string") {
      if (token.length > 0) flat.push({ type: parentType, content: token });
      return;
    }
    const type = token.type ?? parentType;
    if (Array.isArray(token.content)) {
      for (const t of token.content) walk(t, type);
    } else if (typeof token.content === "string") {
      if (token.content.length > 0) flat.push({ type, content: token.content });
    } else {
      walk(token.content, type);
    }
  };
  for (const t of Prism.tokenize(code, grammar)) walk(t, null);
  return flat;
}

function expectedChildrenFromCodeText(
  codeText: string,
  grammar: Prism.Grammar | null,
): ExpectedChild[] {
  // Structure invariant: the middle of a code block always begins with a
  // separator linebreak (after openFence). For each line of code (including
  // the sole empty line of an otherwise empty block), we then emit zero or
  // more highlight tokens followed by a terminating linebreak.
  const result: ExpectedChild[] = [{ kind: "linebreak" }];

  const flat: FlatToken[] =
    codeText.length === 0
      ? []
      : grammar
        ? tokenize(codeText, grammar)
        : [{ type: null, content: codeText }];

  const lineTokens: FlatToken[][] = [[]];
  for (const token of flat) {
    const parts = token.content.split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lineTokens.push([]);
      if (part.length > 0) {
        lineTokens[lineTokens.length - 1].push({
          type: token.type,
          content: part,
        });
      }
    });
  }

  for (const line of lineTokens) {
    for (const t of line) {
      result.push({
        kind: "highlight",
        text: t.content,
        highlightType: t.type,
      });
    }
    result.push({ kind: "linebreak" });
  }
  return result;
}

function middleChildrenMatch(
  actual: LexicalNode[],
  expected: ExpectedChild[],
): boolean {
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i];
    const e = expected[i];
    if (e.kind === "linebreak") {
      if (!$isLineBreakNode(a)) return false;
    } else {
      if (!$isCodeHighlightNode(a)) return false;
      if (a.getTextContent() !== e.text) return false;
      const aType = a.getHighlightType() ?? null;
      if (aType !== e.highlightType) return false;
    }
  }
  return true;
}

// Offset is expressed in the block's flat text-content space, summing the
// sizes of every child (including the open/close fences). Capture and restore
// stay symmetric as long as both sides walk the same children sequence.
function getOffsetInBlock(
  block: MarkdownCodeBlockNode,
  node: LexicalNode,
  offset: number,
): number | null {
  // Element-type selection on the block itself: offset is a child index.
  // Lexical lands here after $insertLineBreak when the new LB's next sibling
  // is not a text node (e.g. another LineBreakNode).
  if (node.is(block)) {
    const children = block.getChildren();
    let pos = 0;
    for (let i = 0; i < offset && i < children.length; i++) {
      pos += children[i].getTextContentSize();
    }
    return pos;
  }

  let cur: LexicalNode | null = node;
  while (cur && cur.getParent()?.getKey() !== block.getKey()) {
    cur = cur.getParent();
  }
  if (!cur) return null;
  let pos = 0;
  for (const child of block.getChildren()) {
    if (child.is(cur)) return pos + offset;
    pos += child.getTextContentSize();
  }
  return null;
}

// Code-content cursor targets are CodeHighlightNodes or empty-line positions
// between LineBreakNodes. The open/close fences are TextNodes but never valid
// targets — exclude them via this guard.
function $isUsableCursorText(
  node: LexicalNode | null | undefined,
): node is TextNode {
  return !!node && $isTextNode(node) && !$isMarkdownCodeFenceNode(node);
}

function setOffsetInBlock(
  block: MarkdownCodeBlockNode,
  offset: number,
): boolean {
  let remaining = offset;
  const children = block.getChildren();
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const size = child.getTextContentSize();

    // Boundary: cursor is exactly before this child.
    if (remaining === 0 && $isLineBreakNode(child)) {
      const prev = children[i - 1];
      if ($isUsableCursorText(prev)) {
        const prevSize = prev.getTextContentSize();
        prev.select(prevSize, prevSize);
        return true;
      }
      // Empty line (prev is another LB or the open fence): anchor element-type
      // selection on the block at this child index.
      block.select(i, i);
      return true;
    }

    if (remaining <= size) {
      if ($isUsableCursorText(child)) {
        child.select(remaining, remaining);
        return true;
      }
      if ($isLineBreakNode(child)) {
        // remaining must be size (=1): cursor is right after this LB.
        const next = children[i + 1];
        if ($isUsableCursorText(next)) {
          next.select(0, 0);
          return true;
        }
        // Next is another LB or close fence — empty line position.
        block.select(i + 1, i + 1);
        return true;
      }
    }
    remaining -= size;
  }

  const last = children[children.length - 1];
  if ($isUsableCursorText(last)) {
    const size = last.getTextContentSize();
    last.select(size, size);
    return true;
  }
  return false;
}

function $highlightCodeBlock(codeBlock: MarkdownCodeBlockNode): void {
  const language = codeBlock.getLanguage();
  const grammar = resolveGrammar(language);

  const codeText = codeBlock.getCodeText();
  if (codeText === null) return;

  const expected = expectedChildrenFromCodeText(codeText, grammar);

  const allChildren = codeBlock.getChildren();
  const middleChildren = allChildren.slice(1, -1);
  if (middleChildrenMatch(middleChildren, expected)) return;

  let savedOffset: number | null = null;
  const selection = $getSelection();
  if ($isRangeSelection(selection) && selection.isCollapsed()) {
    const anchor = selection.anchor;
    savedOffset = getOffsetInBlock(codeBlock, anchor.getNode(), anchor.offset);
  }

  for (const child of middleChildren) child.remove();
  const closeFence = codeBlock.getLastChild();
  if (!closeFence) return;
  for (const item of expected) {
    const node =
      item.kind === "linebreak"
        ? $createLineBreakNode()
        : $createCodeHighlightNode(item.text, item.highlightType ?? undefined);
    closeFence.insertBefore(node);
  }

  if (savedOffset !== null) {
    setOffsetInBlock(codeBlock, savedOffset);
  }
}

function useCodeHighlighting(editor: LexicalEditor): void {
  useEffect(() => {
    return editor.registerNodeTransform(MarkdownCodeBlockNode, (codeBlock) => {
      $highlightCodeBlock(codeBlock);
    });
  }, [editor]);
}

export default function CodeHighlightingPlugin() {
  const [editor] = useLexicalComposerContext();
  useCodeHighlighting(editor);
  return null;
}
