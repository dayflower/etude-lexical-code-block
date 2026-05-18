import {
  COMMAND_PRIORITY_HIGH,
  KEY_ESCAPE_COMMAND,
  type LexicalEditor,
} from "lexical";
import { useEffect } from "react";
import {
  $getCollapsedCaretInCodeBlock,
  $jumpAfterCodeBlock,
} from "../codeBlockOps";

export function useEscapeKeyBehavior(editor: LexicalEditor): void {
  useEffect(() => {
    const remove = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event) => {
        const ctx = $getCollapsedCaretInCodeBlock();
        if (!ctx) return false;
        const { codeBlock } = ctx;

        event?.preventDefault();
        $jumpAfterCodeBlock(codeBlock);
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    return () => {
      remove();
    };
  }, [editor]);
}
