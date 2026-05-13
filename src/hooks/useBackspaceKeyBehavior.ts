import {
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  KEY_BACKSPACE_COMMAND,
  type LexicalEditor,
  type LexicalNode,
} from "lexical";
import { useEffect } from "react";
import {
  $findNearestMarkdownCodeBlockNode,
  $isCursorAtFirstContentLineStart,
  OPEN_FENCE_REGEX,
} from "../codeBlockOps";
import {
  $isMarkdownCodeFenceNode,
  type MarkdownCodeBlockNode,
} from "../MarkdownCodeBlockNode";

// Open fence text always starts with three backticks (see $appendCodeBlockChildren
// and OPEN_FENCE_REGEX). Position the caret right after them so the user keeps
// editing at the boundary between fence marker and language label.
const OPEN_FENCE_MARKER_LENGTH = 3;

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
  while (
    cursor &&
    !$isLineBreakNode(cursor) &&
    !$isMarkdownCodeFenceNode(cursor)
  ) {
    if ($isTextNode(cursor)) {
      mergedText += cursor.getTextContent();
    }
    toRemove.push(cursor);
    cursor = cursor.getNextSibling();
  }

  if (mergedText.length > 0) {
    const newFenceText = openFence.getTextContent() + mergedText;
    openFence.setTextContent(newFenceText);
    const match = OPEN_FENCE_REGEX.exec(newFenceText);
    if (match) {
      codeBlock.setLanguage(match[1] ?? "");
    }
  }
  for (const node of toRemove) {
    node.remove();
  }
  separator.remove();

  openFence.select(OPEN_FENCE_MARKER_LENGTH, OPEN_FENCE_MARKER_LENGTH);
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

        if (!$isCursorAtFirstContentLineStart(anchor, codeBlock)) return false;

        if ($mergeFirstContentLineIntoOpenFence(codeBlock)) {
          event?.preventDefault();
          return true;
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
