import {
  $createParagraphNode,
  $createTextNode,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  type LexicalNode,
  type ParagraphNode,
  type PointType,
  type TextNode,
} from "lexical";
import {
  $appendCodeBlockChildren,
  $isMarkdownCodeBlockNode,
  type MarkdownCodeBlockNode,
} from "./MarkdownCodeBlockNode";

const OPEN_FENCE_REGEX = /^```([a-zA-Z0-9_+-]*)\s*$/;
const CLOSE_FENCE_REGEX = /^```\s*$/;

export function parseOpenFence(text: string): { language: string } | null {
  const match = OPEN_FENCE_REGEX.exec(text);
  if (!match) return null;
  return { language: match[1] ?? "" };
}

export function isCloseFence(text: string): boolean {
  return CLOSE_FENCE_REGEX.test(text);
}

export function $findNearestMarkdownCodeBlockNode(
  node: LexicalNode | null,
): MarkdownCodeBlockNode | null {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isMarkdownCodeBlockNode(current)) return current;
    current = current.getParent();
  }
  return null;
}

export function $getCollapsedCaretInCodeBlock(): {
  anchor: PointType;
  codeBlock: MarkdownCodeBlockNode;
} | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
  const anchor = selection.anchor;
  const codeBlock = $findNearestMarkdownCodeBlockNode(anchor.getNode());
  if (!codeBlock) return null;
  return { anchor, codeBlock };
}

export function $extractValidCodeBlockInfo(
  codeBlock: MarkdownCodeBlockNode,
): { language: string } | null {
  const open = codeBlock.getOpenFence();
  const close = codeBlock.getCloseFence();
  if (!open || !close) return null;
  const parsedOpen = parseOpenFence(open.getTextContent());
  if (!parsedOpen) return null;
  if (!isCloseFence(close.getTextContent())) return null;
  // The merged-on-empty layout (`[openFence, LB, closeFence]`) produced by
  // `$mergeFirstContentLineIntoOpenFence` is not the canonical persistable
  // form but the block itself is still valid; `useCodeBlockNormalizeOnBlur`
  // rebuilds it to canonical on blur. The other non-canonical form (case 4 —
  // close fence merged onto the last content line) is killed at edit time by
  // `useCodeBlockValidationOnEdit` / `$handleCloseFenceLineStartBackspace`
  // and never reaches this check.
  return { language: parsedOpen.language };
}

export function $normalizeCodeBlock(
  codeBlock: MarkdownCodeBlockNode,
  language: string,
): void {
  // Always rebuild as the canonical layout (trailing LB before close fence),
  // regardless of `codeBlock.hasTrailingLineBreak()`. This collapses the
  // transient "close fence merged" state on blur — preserving the merged
  // state across focus loss is not desired, so we intentionally do not
  // consult the predicate here.
  const codeText = codeBlock.getCodeText() ?? "";
  const codeLines = codeText.split("\n");
  const openFenceText =
    codeBlock.getFirstChild()?.getTextContent() ?? `\`\`\`${language}`;
  const closeFenceText = codeBlock.getLastChild()?.getTextContent() ?? "```";
  for (const child of codeBlock.getChildren()) {
    child.remove();
  }
  $appendCodeBlockChildren(codeBlock, openFenceText, codeLines, closeFenceText);
  if (codeBlock.getLanguage() !== language) {
    codeBlock.setLanguage(language);
  }
}

// Replace `node` with one paragraph per "\n"-separated line of `text`. Empty
// lines become empty paragraphs; non-empty lines get a single TextNode child.
// Returns the newly inserted paragraphs in document order.
export function $replaceWithParagraphsPerLine(
  node: LexicalNode,
  text?: string,
): ParagraphNode[] {
  const lines = (text ?? node.getTextContent()).split("\n");
  const created: ParagraphNode[] = [];
  let prev: LexicalNode = node;
  for (const line of lines) {
    const paragraph = $createParagraphNode();
    if (line.length > 0) {
      paragraph.append($createTextNode(line));
    }
    prev.insertAfter(paragraph);
    prev = paragraph;
    created.push(paragraph);
  }
  node.remove();
  return created;
}

// Position of the caret within a code block, encoded as a stable coordinate
// that survives the unwrap. `lineIndex` is the index into the paragraph
// sequence that `$replaceWithParagraphsPerLine` produces (which mirrors the
// "\n"-split of `getTextContent()`), and `lineOffset` is the character offset
// within that line.
type CodeBlockCaretPosition = {
  lineIndex: number;
  lineOffset: number;
};

// Capture the collapsed caret if it currently sits inside `codeBlock`. Returns
// null otherwise so the caller can fall back to Lexical's default selection
// reconciliation (e.g. when the unwrap is driven by an edit that left the
// selection outside the block).
function $captureCaretPositionInCodeBlock(
  codeBlock: MarkdownCodeBlockNode,
): CodeBlockCaretPosition | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const anchor = selection.anchor;
  const anchorNode = anchor.getNode();
  if ($findNearestMarkdownCodeBlockNode(anchorNode) !== codeBlock) return null;

  if (anchor.type === "element") {
    if (anchorNode !== codeBlock) return null;
    return $caretFromChildIndex(codeBlock, anchor.offset);
  }
  if (!$isTextNode(anchorNode)) return null;
  return $caretFromTextNode(anchorNode, anchor.offset);
}

// Walk previous siblings: same-line TextNode lengths fold into `lineOffset`
// until the first LB; every LB encountered after that increments `lineIndex`.
// The open fence is also a TextNode (subclass), but it always sits past at
// least one LB when walking from a non-open-fence anchor, so it never
// contributes to `lineOffset`.
function $caretFromTextNode(
  textNode: TextNode,
  offset: number,
): CodeBlockCaretPosition {
  let lineOffset = offset;
  let lineIndex = 0;
  let crossedLB = false;
  let cur: LexicalNode | null = textNode.getPreviousSibling();
  while (cur) {
    if ($isLineBreakNode(cur)) {
      lineIndex++;
      crossedLB = true;
    } else if (!crossedLB && $isTextNode(cur)) {
      lineOffset += cur.getTextContentSize();
    }
    cur = cur.getPreviousSibling();
  }
  return { lineIndex, lineOffset };
}

// Element-type anchor on the code block itself: `childIndex` is the "caret
// before child[i]" position. Walk children [0, childIndex) accumulating the
// same way as `$caretFromTextNode`, but forward.
function $caretFromChildIndex(
  codeBlock: MarkdownCodeBlockNode,
  childIndex: number,
): CodeBlockCaretPosition {
  const children = codeBlock.getChildren();
  const max = Math.min(childIndex, children.length);
  let lineIndex = 0;
  let lineOffset = 0;
  for (let i = 0; i < max; i++) {
    const child = children[i];
    if ($isLineBreakNode(child)) {
      lineIndex++;
      lineOffset = 0;
    } else if ($isTextNode(child)) {
      lineOffset += child.getTextContentSize();
    }
  }
  return { lineIndex, lineOffset };
}

function $restoreCaretInParagraphs(
  paragraphs: ParagraphNode[],
  pos: CodeBlockCaretPosition,
): void {
  if (paragraphs.length === 0) return;
  const idx = Math.min(pos.lineIndex, paragraphs.length - 1);
  const paragraph = paragraphs[idx];
  const child = paragraph.getFirstChild();
  if ($isTextNode(child)) {
    const safeOffset = Math.min(pos.lineOffset, child.getTextContentSize());
    child.select(safeOffset, safeOffset);
    return;
  }
  paragraph.selectStart();
}

// Dissolve a code block back to plain paragraphs. Preserves the caret across
// the unwrap by translating its in-block position into a (lineIndex,
// lineOffset) coordinate that maps directly onto the resulting paragraph
// sequence — without this, Lexical's selection reconciliation lands the caret
// outside the (now-gone) block.
export function $unwrapMarkdownCodeBlockNode(
  codeBlock: MarkdownCodeBlockNode,
): void {
  const pos = $captureCaretPositionInCodeBlock(codeBlock);
  const paragraphs = $replaceWithParagraphsPerLine(codeBlock);
  if (pos !== null) {
    $restoreCaretInParagraphs(paragraphs, pos);
  }
}

export function $exitCodeBlockBefore(codeBlock: MarkdownCodeBlockNode): void {
  const paragraph = $createParagraphNode();
  codeBlock.insertBefore(paragraph);
  paragraph.select();
}

export function $exitCodeBlockAfter(codeBlock: MarkdownCodeBlockNode): void {
  const paragraph = $createParagraphNode();
  codeBlock.insertAfter(paragraph);
  paragraph.select();
}

export function $jumpAfterCodeBlock(codeBlock: MarkdownCodeBlockNode): void {
  const next = codeBlock.getNextSibling();
  if ($isElementNode(next)) {
    next.selectStart();
    return;
  }
  $exitCodeBlockAfter(codeBlock);
}
