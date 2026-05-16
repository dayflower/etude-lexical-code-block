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
  $isContentTextNode,
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
  trailingLineBreak: boolean,
): ExpectedChild[] {
  // Structure invariant: the middle of a code block always begins with a
  // separator linebreak (after openFence). For each line of code (including
  // the sole empty line of an otherwise empty block), we then emit zero or
  // more highlight tokens followed by a terminating linebreak.
  //
  // `trailingLineBreak` mirrors the current structure: when the close fence
  // has been merged onto the last content line (caret moved up via Backspace
  // at the close-fence-line start), the final LB is dropped so the rebuild
  // does not silently re-canonicalize that transient state.
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
  if (!trailingLineBreak && result.length > 0) {
    result.pop();
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

// Element-type anchor: `anchor.offset` is a child index. Lexical lands here
// after $insertLineBreak when the new LB's next sibling is not a text node
// (e.g. another LineBreakNode).
function getOffsetForElementAnchor(
  block: MarkdownCodeBlockNode,
  childIndex: number,
): number {
  const children = block.getChildren();
  let pos = 0;
  for (let i = 0; i < childIndex && i < children.length; i++) {
    pos += children[i].getTextContentSize();
  }
  return pos;
}

// Text-type anchor: walk up to the block's direct child, then sum sizes of
// the children that precede it and add the in-child offset.
function getOffsetForTextAnchor(
  block: MarkdownCodeBlockNode,
  node: LexicalNode,
  offset: number,
): number | null {
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

// A position between two adjacent children of the block (or at either end).
// `before` / `after` may be null when the boundary sits at the very start or
// end. `blockChildIndex` is the child index that an element-type fallback
// would target (i.e. the index of `after`, or `children.length` at the tail).
type CursorBoundary = {
  before: LexicalNode | null;
  after: LexicalNode | null;
  blockChildIndex: number;
};

// Decide where the caret lands for a between-children boundary. Priority:
//   1. Adjacent content TextNode (prev preferred over next) — natural target.
//   2. Adjacent fence (TextNode but not content) — text-type selection at
//      the fence edge mirrors the captured "approached from inside the
//      fence" landing and keeps the selection kind stable across rebuilds.
//   3. Element-type selection on the block (empty-line fallback).
// Returning false signals a degenerate boundary with no children to anchor.
function $resolveCursorAt(
  block: MarkdownCodeBlockNode,
  boundary: CursorBoundary,
): boolean {
  const { before, after, blockChildIndex } = boundary;
  if ($isContentTextNode(before)) {
    const size = before.getTextContentSize();
    before.select(size, size);
    return true;
  }
  if ($isContentTextNode(after)) {
    after.select(0, 0);
    return true;
  }
  if ($isTextNode(before)) {
    const size = before.getTextContentSize();
    before.select(size, size);
    return true;
  }
  if ($isTextNode(after)) {
    after.select(0, 0);
    return true;
  }
  if (before === null && after === null) return false;
  block.select(blockChildIndex, blockChildIndex);
  return true;
}

function setOffsetInBlock(
  block: MarkdownCodeBlockNode,
  targetOffset: number,
): boolean {
  const children = block.getChildren();
  let runningOffset = 0;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];

    // Boundary just before this child (= just after children[i - 1]).
    if (runningOffset === targetOffset) {
      return $resolveCursorAt(block, {
        before: i > 0 ? children[i - 1] : null,
        after: child,
        blockChildIndex: i,
      });
    }

    const size = child.getTextContentSize();

    // Strictly inside a TextNode child (not at either edge). Includes the
    // "between ``` and the language label" position inside an open fence.
    if (
      targetOffset > runningOffset &&
      targetOffset < runningOffset + size &&
      $isTextNode(child)
    ) {
      const inChild = targetOffset - runningOffset;
      child.select(inChild, inChild);
      return true;
    }

    runningOffset += size;
  }

  // Boundary at the very end of the block.
  if (runningOffset === targetOffset) {
    return $resolveCursorAt(block, {
      before: children[children.length - 1] ?? null,
      after: null,
      blockChildIndex: children.length,
    });
  }

  // Target offset overshoots the block; clamp to end of last content text.
  const last = children[children.length - 1];
  if ($isContentTextNode(last)) {
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

  // Preserve the "close fence merged with last content line" transient
  // state (see $mergeCloseFenceIntoLastContentLine). The rebuild must not
  // invent a trailing LB when the structure currently has none.
  const closeFence = codeBlock.getLastChild();
  const trailingLineBreak = codeBlock.hasTrailingLineBreak();
  const expected = expectedChildrenFromCodeText(
    codeText,
    grammar,
    trailingLineBreak,
  );

  const allChildren = codeBlock.getChildren();
  const middleChildren = allChildren.slice(1, -1);
  if (middleChildrenMatch(middleChildren, expected)) return;

  let savedOffset: number | null = null;
  const selection = $getSelection();
  if ($isRangeSelection(selection) && selection.isCollapsed()) {
    const anchor = selection.anchor;
    const anchorNode = anchor.getNode();
    savedOffset = anchorNode.is(codeBlock)
      ? getOffsetForElementAnchor(codeBlock, anchor.offset)
      : getOffsetForTextAnchor(codeBlock, anchorNode, anchor.offset);
  }

  for (const child of middleChildren) child.remove();
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
