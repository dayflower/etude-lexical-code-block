import {
  $createParagraphNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  KEY_ESCAPE_COMMAND,
  type LexicalEditor,
} from "lexical";
import { useEffect } from "react";
import { $findNearestMarkdownCodeBlockNode } from "../codeBlockOps";

export function useEscapeKeyBehavior(editor: LexicalEditor): void {
  useEffect(() => {
    const remove = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed())
          return false;

        const anchorNode = selection.anchor.getNode();
        const codeBlock = $findNearestMarkdownCodeBlockNode(anchorNode);
        if (!codeBlock) return false;

        event?.preventDefault();

        const next = codeBlock.getNextSibling();
        if ($isElementNode(next)) {
          next.selectStart();
        } else {
          const paragraph = $createParagraphNode();
          codeBlock.insertAfter(paragraph);
          paragraph.select();
        }
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    return () => {
      remove();
    };
  }, [editor]);
}
