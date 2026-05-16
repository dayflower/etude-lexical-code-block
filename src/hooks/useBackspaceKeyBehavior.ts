import {
  $getSelection,
  $isLineBreakNode,
  $isParagraphNode,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { useEffect } from "react";
import {
  $findNearestMarkdownCodeBlockNode,
  parseOpenFence,
} from "../codeBlockOps";
import {
  $isCursorAtCloseFenceLineStart,
  $isCursorAtCodeBlockStart,
  $isCursorAtFirstContentLineStart,
} from "../cursorPredicates";
import {
  $isContentTextNode,
  $isMarkdownCodeFenceNode,
  type MarkdownCodeBlockNode,
  OPEN_FENCE_PREFIX_LENGTH,
} from "../MarkdownCodeBlockNode";

function $mergeFirstContentLineIntoOpenFence(
  codeBlock: MarkdownCodeBlockNode,
): boolean {
  const openFence = codeBlock.getFirstChild();
  if (!$isMarkdownCodeFenceNode(openFence)) return false;

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

// Caret sits at the start of the close-fence line (just after the last LB).
// Backspace at the start of a line normally joins it with the previous one;
// applied here that means removing the LB so the close fence sits on the same
// visual line as the last content. Lexical's default does delete the LB, but
// the resulting "no LB before closeFence" layout then trips up
// CodeHighlightingPlugin's rebuild (see expectedChildrenFromCodeText) — so we
// handle it ourselves and leave the structure intact for the plugin to keep.
function $mergeCloseFenceIntoLastContentLine(
  codeBlock: MarkdownCodeBlockNode,
): boolean {
  const closeFence = codeBlock.getLastChild();
  if (!$isMarkdownCodeFenceNode(closeFence)) return false;

  const lastLB = closeFence.getPreviousSibling();
  if (!$isLineBreakNode(lastLB)) return false;

  const before = lastLB.getPreviousSibling();
  if (!before) return false;

  if ($isContentTextNode(before)) {
    // Last line carries content: drop the LB and park the caret at the join
    // point (end of the content, immediately before the close fence text).
    const size = before.getTextContentSize();
    lastLB.remove();
    before.select(size, size);
    return true;
  }

  // Empty trailing line (prev is another LB) or no content (prev is the open
  // fence). Don't collapse further — just slide the caret up onto the empty
  // line above so a second Backspace can clean it up via Lexical's default.
  const index = lastLB.getIndexWithinParent();
  codeBlock.select(index, index);
  return true;
}

export function useBackspaceKeyBehavior(editor: LexicalEditor): void {
  useEffect(() => {
    const remove = editor.registerCommand(
      KEY_BACKSPACE_COMMAND,
      (event: KeyboardEvent | null) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed())
          return false;

        const anchor = selection.anchor;
        const codeBlock = $findNearestMarkdownCodeBlockNode(anchor.getNode());
        if (!codeBlock) return false;

        if ($isCursorAtCodeBlockStart(anchor, codeBlock)) {
          // Backspace at the very start of the code block. Lexical's default
          // handler dissolves the block (merging it into the previous block).
          // When the previous sibling is an empty paragraph, simply remove it
          // so the structure is preserved. When the previous sibling has
          // content, fall through so the user can still merge content above
          // — the reassemble transform recovers the block on the next split.
          const prev = codeBlock.getPreviousSibling();
          if ($isParagraphNode(prev) && prev.getTextContentSize() === 0) {
            prev.remove();
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
