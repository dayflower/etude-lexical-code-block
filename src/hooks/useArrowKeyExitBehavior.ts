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
  $isCursorAtCodeBlockEnd,
  $isCursorOnCloseFenceLine,
} from "../codeBlockOps";
import { $isMarkdownCodeFenceNode } from "../MarkdownCodeBlockNode";

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

      const closeFence = codeBlock.getLastChild();
      if (!$isMarkdownCodeFenceNode(closeFence)) return false;

      if (requireEnd) {
        if (!$isCursorAtCodeBlockEnd(anchor, codeBlock, closeFence))
          return false;
      } else {
        if (!$isCursorOnCloseFenceLine(anchor, codeBlock, closeFence))
          return false;
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
