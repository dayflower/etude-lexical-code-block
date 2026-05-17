import {
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  INSERT_PARAGRAPH_COMMAND,
  type LexicalEditor,
} from "lexical";
import { useEffect } from "react";
import {
  $exitCodeBlockAfter,
  $exitCodeBlockBefore,
  $getCollapsedCaretInCodeBlock,
  parseOpenFence,
} from "../codeBlockOps";
import {
  $isCursorAtCodeBlockEnd,
  $isCursorAtCodeBlockStart,
} from "../cursorPredicates";
import {
  $createEmptyMarkdownCodeBlockNode,
  $selectFirstContentLineStart,
} from "../MarkdownCodeBlockNode";

export function useInsertParagraphBehavior(editor: LexicalEditor): void {
  useEffect(() => {
    const remove = editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      () => {
        const ctx = $getCollapsedCaretInCodeBlock();
        if (ctx) {
          const { anchor, codeBlock } = ctx;
          if ($isCursorAtCodeBlockStart(anchor, codeBlock)) {
            $exitCodeBlockBefore(codeBlock);
            return true;
          }

          if ($isCursorAtCodeBlockEnd(anchor, codeBlock)) {
            $exitCodeBlockAfter(codeBlock);
            return true;
          }

          const selection = $getSelection();
          if (!$isRangeSelection(selection)) return false;
          selection.insertLineBreak();
          return true;
        }

        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed())
          return false;

        const anchor = selection.anchor;
        const anchorNode = anchor.getNode();

        if (!$isTextNode(anchorNode)) return false;
        const parent = anchorNode.getParent();
        if (!$isParagraphNode(parent)) return false;
        if (anchor.offset !== anchorNode.getTextContentSize()) return false;

        const parsed = parseOpenFence(parent.getTextContent());
        if (!parsed) return false;

        const language = parsed.language;
        const codeBlockNode = $createEmptyMarkdownCodeBlockNode(language);
        parent.replace(codeBlockNode);
        $selectFirstContentLineStart(codeBlockNode);
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      remove();
    };
  }, [editor]);
}
