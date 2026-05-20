import { $isLineBreakNode, type LexicalNode, type PointType } from "lexical";
import {
  FIRST_CONTENT_LINE_CHILD_INDEX,
  type MarkdownCodeBlockNode,
} from "./MarkdownCodeBlockNode";

// All predicates derive the relevant fence node from the code block internally
// (`getFirstChild()` / `getLastChild()`) and return false when the fence is
// missing or not a MarkdownCodeFenceNode. Callers do not need to pre-check the
// fence — pass any block, even a degenerate one.

export function $isCursorAtCodeBlockStart(
  anchor: PointType,
  codeBlock: MarkdownCodeBlockNode,
): boolean {
  const openFence = codeBlock.getOpenFence();
  if (!openFence) return false;
  const anchorNode = anchor.getNode();
  if (anchorNode.is(openFence)) return anchor.offset === 0;
  if (anchorNode.is(codeBlock)) return anchor.offset === 0;
  return false;
}

export function $isCursorAtCodeBlockEnd(
  anchor: PointType,
  codeBlock: MarkdownCodeBlockNode,
): boolean {
  const closeFence = codeBlock.getCloseFence();
  if (!closeFence) return false;
  const anchorNode = anchor.getNode();
  if (anchorNode.is(closeFence)) {
    return anchor.offset === anchorNode.getTextContentSize();
  }
  if (anchorNode.is(codeBlock)) {
    return anchor.offset >= codeBlock.getChildrenSize();
  }
  return false;
}

// Canonical child layout is [openFence, LB(sep), firstContent, ...]. The
// "very start of the first content line" sits just after the separator LB,
// either as an element-type anchor on the block at offset 2 (empty first
// line) or as a text-type anchor at offset 0 of the first content child.
//
// Degenerate guard: in the layout `[openFence, LB, closeFence]` (case 3 —
// produced by `$mergeFirstContentLineIntoOpenFence` when the user merged the
// only content row away), the child at FIRST_CONTENT_LINE_CHILD_INDEX is the
// close fence itself. That position is also the close-fence-line start, and
// merging "no content" via the first-content-line Backspace path would just
// drop the separator LB and leave `[openFence, closeFence]` — which
// `useCodeBlockValidationOnEdit` then dissolves. Treat the degenerate state
// as "no first content line" so the Backspace handler falls through to the
// close-fence-line-start branch (which slides the caret up instead).
export function $isCursorAtFirstContentLineStart(
  anchor: PointType,
  codeBlock: MarkdownCodeBlockNode,
): boolean {
  const firstContent = codeBlock.getChildAtIndex(
    FIRST_CONTENT_LINE_CHILD_INDEX,
  );
  if (!firstContent || firstContent.is(codeBlock.getCloseFence())) {
    return false;
  }

  const anchorNode = anchor.getNode();
  if (anchorNode.is(codeBlock)) {
    return anchor.offset === FIRST_CONTENT_LINE_CHILD_INDEX;
  }

  if (anchor.offset !== 0) return false;
  return anchorNode.is(firstContent);
}

// Mirror of $isCursorAtFirstContentLineStart for the opposite end. The "very
// start of the close fence line" sits just before the closeFence, either as an
// element-type anchor on the block at offset (childrenSize - 1) or as a
// text-type anchor at offset 0 of the close fence.
export function $isCursorAtCloseFenceLineStart(
  anchor: PointType,
  codeBlock: MarkdownCodeBlockNode,
): boolean {
  const closeFence = codeBlock.getCloseFence();
  if (!closeFence) return false;
  const anchorNode = anchor.getNode();
  if (anchorNode.is(closeFence)) return anchor.offset === 0;
  if (anchorNode.is(codeBlock)) {
    return anchor.offset === codeBlock.getChildrenSize() - 1;
  }
  return false;
}

export function $isCursorOnCloseFenceLine(
  anchor: PointType,
  codeBlock: MarkdownCodeBlockNode,
): boolean {
  const closeFence = codeBlock.getCloseFence();
  if (!closeFence) return false;
  const anchorNode = anchor.getNode();
  if (anchorNode.is(closeFence)) return true;

  let scan: LexicalNode | null;
  if (anchorNode.is(codeBlock)) {
    if (anchor.offset >= codeBlock.getChildrenSize()) return true;
    scan = codeBlock.getChildAtIndex(anchor.offset);
  } else if (anchorNode.getParent()?.is(codeBlock)) {
    scan = anchorNode.getNextSibling();
  } else {
    return false;
  }

  while (scan && !scan.is(closeFence)) {
    if ($isLineBreakNode(scan)) return false;
    scan = scan.getNextSibling();
  }
  return scan?.is(closeFence) ?? false;
}
