import {
  $createParagraphNode,
  $isElementNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ESCAPE_COMMAND,
  type LexicalEditor,
} from "lexical";
import { useEffect } from "react";
import { $getCollapsedCaretInCodeBlock } from "../codeBlockOps";

export function useEscapeKeyBehavior(editor: LexicalEditor): void {
  useEffect(() => {
    const remove = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        const ctx = $getCollapsedCaretInCodeBlock();
        if (!ctx) return false;
        const { codeBlock } = ctx;

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
