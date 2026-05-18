import {
  $isLineBreakNode,
  $isParagraphNode,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  type LexicalEditor,
  type LexicalNode,
  type ParagraphNode,
} from "lexical";
import { useEffect } from "react";
import {
  $getCollapsedCaretInCodeBlock,
  $replaceWithParagraphsPerLine,
  parseOpenFence,
} from "../codeBlockOps";
import {
  $isCursorAtCloseFenceLineStart,
  $isCursorAtCodeBlockStart,
  $isCursorAtFirstContentLineStart,
} from "../cursorPredicates";
import {
  $isContentTextNode,
  type MarkdownCodeBlockNode,
  OPEN_FENCE_PREFIX_LENGTH,
} from "../MarkdownCodeBlockNode";

function $mergeFirstContentLineIntoOpenFence(
  codeBlock: MarkdownCodeBlockNode,
): boolean {
  const openFence = codeBlock.getOpenFence();
  if (!openFence) return false;

  const separator = openFence.getNextSibling();
  if (!$isLineBreakNode(separator)) return false;

  // Collect every TextNode on the first content line (between the separator
  // LB and the next LB / close fence). Code highlighting splits a single
  // logical line into multiple sibling tokens, so this is a walk, not a peek.
  let mergedText = "";
  const toRemove: LexicalNode[] = [];
  let cursor: LexicalNode | null = separator.getNextSibling();
  while ($isContentTextNode(cursor)) {
    mergedText += cursor.getTextContent();
    toRemove.push(cursor);
    cursor = cursor.getNextSibling();
  }

  if (mergedText.length > 0) {
    const newFenceText = openFence.getTextContent() + mergedText;
    openFence.setTextContent(newFenceText);
    const parsed = parseOpenFence(newFenceText);
    if (parsed) {
      codeBlock.setLanguage(parsed.language);
    }
  }
  for (const node of toRemove) {
    node.remove();
  }
  separator.remove();

  openFence.select(OPEN_FENCE_PREFIX_LENGTH, OPEN_FENCE_PREFIX_LENGTH);
  return true;
}

// Backspace at the very start of a code block whose previous sibling is a
// non-empty paragraph. Lexical's default Backspace would merge the block's
// existing children (MarkdownCodeFenceNode / CodeHighlightNode) into that
// paragraph, leaving their CSS classes (`.markdown-code-fence`, `.token *`)
// behind even though the text is no longer in a code context. Instead, we
// unwrap the block into plain ParagraphNode/TextNode rows via
// `$replaceWithParagraphsPerLine`, then move the first row's children into
// `prev` so the merge happens through freshly created plain TextNodes only.
function $dissolveCodeBlockMergingIntoPrev(
  codeBlock: MarkdownCodeBlockNode,
  prev: ParagraphNode,
): void {
  const paragraphs = $replaceWithParagraphsPerLine(codeBlock);
  const first = paragraphs[0];
  if (!first) return;

  const movedChildren = [...first.getChildren()];
  for (const child of movedChildren) {
    prev.append(child);
  }
  first.remove();

  const firstMoved = movedChildren[0];
  if (firstMoved !== undefined && $isTextNode(firstMoved)) {
    firstMoved.select(0, 0);
    return;
  }
  prev.select(prev.getChildrenSize(), prev.getChildrenSize());
}

// Caret sits at the start of the close-fence line (just after the last LB).
// Backspace at the start of a line normally joins it with the previous one;
// applied here, drop the trailing LB so the close fence moves up onto the
// line above. We can't fall through to Lexical's default LB-delete because
// the resulting "no LB before closeFence" layout trips up
// CodeHighlightingPlugin's rebuild (see expectedChildrenFromCodeText), so we
// handle it ourselves and rely on `hasTrailingLineBreak()` to signal the
// transient layout to the rebuilder.
//
// Cursor placement depends on what sits on the line above:
//   - Content text — caret at the join point (end of the content).
//   - Empty content line (another LB above) — caret at the close-fence start.
//
// When the only thing above is the open fence (degenerate [openFence, LB,
// closeFence] reached only by typing into the merged-on-empty state), there
// is no further line to merge onto. Slide the caret up instead.
function $mergeCloseFenceIntoLastContentLine(
  codeBlock: MarkdownCodeBlockNode,
): boolean {
  const closeFence = codeBlock.getCloseFence();
  if (!closeFence) return false;

  const lastLB = closeFence.getPreviousSibling();
  if (!$isLineBreakNode(lastLB)) return false;

  const before = lastLB.getPreviousSibling();
  if (!before) return false;

  if ($isContentTextNode(before)) {
    const size = before.getTextContentSize();
    lastLB.remove();
    before.select(size, size);
    return true;
  }

  if ($isLineBreakNode(before)) {
    lastLB.remove();
    closeFence.select(0, 0);
    return true;
  }

  const index = lastLB.getIndexWithinParent();
  codeBlock.select(index, index);
  return true;
}

export function useBackspaceKeyBehavior(editor: LexicalEditor): void {
  useEffect(() => {
    const remove = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event: KeyboardEvent | null) => {
        const ctx = $getCollapsedCaretInCodeBlock();
        if (!ctx) return false;
        const { anchor, codeBlock } = ctx;

        if ($isCursorAtCodeBlockStart(anchor, codeBlock)) {
          // Backspace at the very start of the code block. Lexical's default
          // handler dissolves the block (merging its children into the
          // previous block). When the previous sibling is an empty paragraph,
          // simply remove it so the structure is preserved. When the previous
          // sibling is a non-empty paragraph, we cannot fall through —
          // Lexical's default would move the existing
          // MarkdownCodeFenceNode / CodeHighlightNode children into the
          // paragraph and their syntax-coloring CSS classes would leak out.
          // Handle the dissolution ourselves through plain TextNodes.
          const prev = codeBlock.getPreviousSibling();
          if ($isParagraphNode(prev) && prev.getTextContentSize() === 0) {
            prev.remove();
            event?.preventDefault();
            return true;
          }
          if ($isParagraphNode(prev)) {
            $dissolveCodeBlockMergingIntoPrev(codeBlock, prev);
            event?.preventDefault();
            return true;
          }
          return false;
        }

        if ($isCursorAtFirstContentLineStart(anchor, codeBlock)) {
          if ($mergeFirstContentLineIntoOpenFence(codeBlock)) {
            event?.preventDefault();
            return true;
          }
          return false;
        }

        if ($isCursorAtCloseFenceLineStart(anchor, codeBlock)) {
          if ($mergeCloseFenceIntoLastContentLine(codeBlock)) {
            event?.preventDefault();
            return true;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    return () => {
      remove();
    };
  }, [editor]);
}
