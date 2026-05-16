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
  $findNearestMarkdownCodeBlockNode,
  $isCursorAtCodeBlockEnd,
  $isCursorAtCodeBlockStart,
  parseOpenFence,
} from "../codeBlockOps";
import {
  $appendCodeBlockChildren,
  $createMarkdownCodeBlockNode,
  $isMarkdownCodeFenceNode,
  $selectFirstContentLineStart,
} from "../MarkdownCodeBlockNode";

export function useInsertParagraphBehavior(editor: LexicalEditor): void {
  useEffect(() => {
    const remove = editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed())
          return false;

        const anchor = selection.anchor;
        const anchorNode = anchor.getNode();

        const codeBlock = $findNearestMarkdownCodeBlockNode(anchorNode);
        if (codeBlock) {
          const openFence = codeBlock.getFirstChild();
          const closeFence = codeBlock.getLastChild();

          if (
            $isMarkdownCodeFenceNode(openFence) &&
            $isCursorAtCodeBlockStart(anchor, codeBlock, openFence)
          ) {
            $exitCodeBlockBefore(codeBlock);
            return true;
          }

          if (
            $isMarkdownCodeFenceNode(closeFence) &&
            $isCursorAtCodeBlockEnd(anchor, codeBlock, closeFence)
          ) {
            $exitCodeBlockAfter(codeBlock);
            return true;
          }

          selection.insertLineBreak();
          return true;
        }

        if (!$isTextNode(anchorNode)) return false;
        const parent = anchorNode.getParent();
        if (!$isParagraphNode(parent)) return false;
        if (anchor.offset !== anchorNode.getTextContentSize()) return false;

        const parsed = parseOpenFence(parent.getTextContent());
        if (!parsed) return false;

        const language = parsed.language;
        const codeBlockNode = $createMarkdownCodeBlockNode(language);
        $appendCodeBlockChildren(
          codeBlockNode,
          `\`\`\`${language}`,
          [""],
          "```",
        );
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
