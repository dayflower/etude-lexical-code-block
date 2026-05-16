import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  type LexicalEditor,
} from "lexical";
import { useEffect } from "react";
import {
  $exitCodeBlockAfter,
  $findNearestMarkdownCodeBlockNode,
} from "../codeBlockOps";
import {
  $isCursorAtCodeBlockEnd,
  $isCursorOnCloseFenceLine,
} from "../cursorPredicates";

export function useArrowKeyExitBehavior(editor: LexicalEditor): void {
  useEffect(() => {
    function $tryExit(
      event: KeyboardEvent | null,
      requireEnd: boolean,
    ): boolean {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed())
        return false;

      const anchor = selection.anchor;
      const anchorNode = anchor.getNode();

      const codeBlock = $findNearestMarkdownCodeBlockNode(anchorNode);
      if (!codeBlock) return false;
      if (codeBlock.getNextSibling() !== null) return false;

      if (requireEnd) {
        if (!$isCursorAtCodeBlockEnd(anchor, codeBlock)) return false;
      } else {
        if (!$isCursorOnCloseFenceLine(anchor, codeBlock)) return false;
      }

      event?.preventDefault();
      $exitCodeBlockAfter(codeBlock);
      return true;
    }

    const removeRight = editor.registerCommand(
      KEY_ARROW_RIGHT_COMMAND,
      (event) => $tryExit(event, true),
      COMMAND_PRIORITY_LOW,
    );
    const removeDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (event) => $tryExit(event, false),
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      removeRight();
      removeDown();
    };
  }, [editor]);
}
